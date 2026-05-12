from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, ServiceToken, Todo, Notification, Email, Meeting
from app.core.schemas import (
    DashboardData, DailyBrief, EmailResponse, MeetingResponse, 
    TodoResponse, NotificationResponse, Suggestion, TodoCreate, TodoUpdate,
    HealthDataResponse
)

import redis
import json
from app.core.config import settings
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from app.core.background_tasks import sync_user_data
from app.core.google_utils import get_google_credentials

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

from app.core.cache import cache
# redis_client removed in favor of SafeCache
from app.core.rate_limit import RateLimiter


def get_time_ago(dt: datetime) -> str:
    """Calculate time ago string"""
    if not dt:
        return ""
    now = datetime.now(timezone.utc)
    # Make sure dt is timezone-aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    
    if diff.days > 0:
        return f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
    elif diff.seconds >= 3600:
        hours = diff.seconds // 3600
        return f"{hours} hour{'s' if hours > 1 else ''} ago"
    elif diff.seconds >= 60:
        minutes = diff.seconds // 60
        return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
    else:
        return "Just now"

def get_time_of_day() -> str:
    """Get time of day greeting"""
    hour = datetime.now(timezone.utc).hour
    if hour < 12:
        return "morning"
    elif hour < 17:
        return "afternoon"
    else:
        return "evening"

def is_all_day_event(m: Meeting) -> bool:
    """Check if a meeting is an all-day event (like a festival or holiday)."""
    if not m.start_time or not m.end_time:
        return True
    st = m.start_time.replace(tzinfo=None) if m.start_time.tzinfo else m.start_time
    et = m.end_time.replace(tzinfo=None) if m.end_time.tzinfo else m.end_time
    return st.hour == 0 and st.minute == 0 and et.hour == 0 and et.minute == 0

def generate_suggestions(meetings: List[MeetingResponse], emails: List[EmailResponse], todos: List[TodoResponse]) -> List[Suggestion]:
    """Generate AI-powered suggestions — only actionable items with real navigation targets."""
    suggestions = []
    
    # Email suggestions
    high_priority_emails = [e for e in emails if e.priority == "high" and e.unread]
    if high_priority_emails:
        suggestions.append(Suggestion(
            id=len(suggestions) + 1,
            type="action",
            message=f"You have {len(high_priority_emails)} high-priority email{'s' if len(high_priority_emails) != 1 else ''} that may need attention",
            action="View Emails"
        ))
    
    # Todo suggestions
    urgent_todos = [t for t in todos if t.priority == "high" and not t.completed]
    if urgent_todos:
        suggestions.append(Suggestion(
            id=len(suggestions) + 1,
            type="reminder",
            message=f"You have {len(urgent_todos)} urgent task{'s' if len(urgent_todos) != 1 else ''} to complete",
            action="View Tasks"
        ))

    # Meeting conflict suggestion
    if len(meetings) >= 2:
        suggestions.append(Suggestion(
            id=len(suggestions) + 1,
            type="action",
            message=f"You have {len(meetings)} upcoming meeting{'s' if len(meetings) != 1 else ''}. Check your calendar for conflicts.",
            action="View Meetings"
        ))
    
    return suggestions


    
# Helper for Sync Triggering
def trigger_sync_if_needed(current_user: User, db: Session, background_tasks: BackgroundTasks, force_check: bool = False):
    """
    Checks if a sync is needed (empty DB or stale data) and triggers it safely.
    Returns True if triggered, False otherwise.
    """
    should_trigger_sync = False
    
    # Check if we have data
    has_emails = db.query(Email).filter(Email.user_id == current_user.id).first() is not None
    # We can check meetings too if we want a holistic check, but for get_emails, knowing we have emails is enough.
    # But sticking to the dashboard logic:
    has_meetings = db.query(Meeting).filter(Meeting.user_id == current_user.id).first() is not None

    if not has_emails and not has_meetings:
        should_trigger_sync = True
    elif force_check:
        # Check staleness
        if current_user.last_synced_at:
             time_since_sync = datetime.now() - current_user.last_synced_at.replace(tzinfo=None)
             if time_since_sync.total_seconds() > 300: # 5 mins to prevent hitting Google APIs constantly
                 should_trigger_sync = True
        else:
             should_trigger_sync = True

    if should_trigger_sync:
        sync_lock_key = f"sync:locked:{current_user.id}"
        
        if not cache.exists(sync_lock_key):
            print(f"Triggering background sync for user {current_user.id}...")
            
            # Atomic DB Lock
            try:
                current_user.last_synced_at = datetime.now()
                db.commit()
            except Exception as e:
                print(f"Failed to acquire sync lock on DB: {e}")
                db.rollback()
                return False

            try:
                # Use FastAPI BackgroundTasks instead of Celery
                if background_tasks:
                    background_tasks.add_task(sync_user_data, current_user.id)
                else:
                    # Fallback if no bg tasks (shouldn't happen with correct dependency injection)
                    # Run synchronously to ensure data availability on first load? 
                    # No, that blocks. Better to just warn.
                    print("BackgroundTasks not provided, running sync synchronously (might block)")
                    sync_user_data(current_user.id)
                    
                cache.set(sync_lock_key, "1", ex=30)
                return True
            except Exception as e:
                print(f"Background sync trigger failed: {e}")
                return False
    return False

@router.get("/contextual-data", response_model=DashboardData, dependencies=[Depends(RateLimiter("summary", 60))])
async def get_contextual_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    if background_tasks is None:
        background_tasks = BackgroundTasks()

    """Get all contextual dashboard data (Cached + DB Read Only)"""
    import time
    start_time = time.time()
    print(f"[{start_time}] Starting get_contextual_data")
    
    # 1. Try Cache
    try:
        cache_key = f"dashboard:summary:{current_user.id}"
        # Use SafeCache wrapper 'cache' instead of 'redis_client'
        cached_data = cache.get(cache_key)
        
        if cached_data:
            try:
                return DashboardData(**json.loads(cached_data))
            except Exception as e:
                print(f"Cache parse error: {e}")
    except Exception as e:
        print(f"Redis cache error: {e}")
    
    print(f"[{time.time() - start_time:.3f}s] Cache miss, fetching from DB...")
    
    # 2. Fetch from DB (Fast!)
    # 2. Fetch from DB (Fast!)
    # Emails - Only show UNREAD emails for the dashboard
    db_emails = db.query(Email).filter(
        Email.user_id == current_user.id,
        Email.is_read == False
    ).order_by(Email.received_at.desc()).limit(50).all()
    emails_response = [EmailResponse(
        id=e.id,
        from_email=e.sender,
        subject=e.subject,
        preview=e.preview,
        priority=e.priority,
        unread=e.is_read is False,
        timestamp=get_time_ago(e.received_at),
        time=get_time_ago(e.received_at),
        thread_id=e.thread_id
    ) for e in db_emails]

    # Meetings
    now = datetime.now()
    all_db_meetings = db.query(Meeting).filter(
        Meeting.user_id == current_user.id,
        Meeting.start_time >= now
    ).order_by(Meeting.start_time.asc()).limit(20).all()
    
    # Filter out all-day events (festivals) and take the top 5
    db_meetings = [m for m in all_db_meetings if not is_all_day_event(m)][:5]
    
    meetings_response = [MeetingResponse(
        id=m.id,
        title=m.title,
        time=m.start_time.strftime("%I:%M %p") if m.start_time else "",
        duration="30 min",
        location=m.location or "Virtual",
        attendees=json.loads(m.attendees) if m.attendees else [],
        upcoming=True,
        date=m.start_time.isoformat() if m.start_time else None,
        start_datetime=m.start_time.isoformat() if m.start_time else None,
        end_datetime=m.end_time.isoformat() if m.end_time else None,
        description=m.description,
        meet_link=m.meet_link,
    ) for m in db_meetings]
    
    # Todos
    todos = db.query(Todo).filter(
        Todo.user_id == current_user.id,
        Todo.completed == False
    ).limit(10).all()
    todos_response = [TodoResponse.model_validate(todo) for todo in todos]
    
    # Notifications
    notifications = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False
    ).order_by(Notification.created_at.desc()).limit(10).all()
    notifications_response = [
        NotificationResponse(
            id=notif.id,
            type=notif.type,
            message=notif.message,
            read=notif.read,
            time=get_time_ago(notif.created_at),
            related_id=notif.related_id
        ) for notif in notifications
    ]
    
    # 2.5 Generate Brief and Suggestions
    # Fixed: Define daily_brief and suggestions which were missing
    daily_brief = DailyBrief(
        greeting=f"Good {get_time_of_day()}, {current_user.name or 'there'}!",
        summary=f"You have {len(db_meetings)} meetings and {len([e for e in emails_response if e.priority == 'high'])} important emails today."
    )
    
    suggestions = generate_suggestions(meetings_response, emails_response, todos_response)
    
    # Placeholder for health data (could be expanded later)
    health_data = None
    
    # Formulate a summary/insight

    # Removed synchronous LLM call for insight to drastically improve dashboard load speed
    insight = "Stay productive! Check your priority emails and upcoming meetings."

    dashboard_data = DashboardData(
        dailyBrief=daily_brief,
        emails=emails_response,
        meetings=meetings_response,
        todos=todos_response,
        notifications=notifications_response,
        suggestions=suggestions,
        health=HealthDataResponse.model_validate(health_data) if health_data else None,
        ai_insight=insight
    )
    
    # 3. Cache Result (10 mins)
    try:
        cache.set(cache_key, json.dumps(dashboard_data.model_dump(), default=str), ex=600)
    except Exception as e:
        print(f"Redis set error: {e}")
 
    # 4. Trigger Background Sync
    print(f"[{time.time() - start_time:.3f}s] Triggering sync check...")
    trigger_sync_if_needed(current_user, db, background_tasks, force_check=True)
    print(f"[{time.time() - start_time:.3f}s] Finished get_contextual_data")
 
    return dashboard_data

    # Return with health data appended
    response = dashboard_data.dict()
    response["health"] = health_data
    return response

@router.get("/emails", response_model=List[EmailResponse], dependencies=[Depends(RateLimiter("emails", 100))])
async def get_emails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
    limit: int = 20,
    offset: int = 0
):
    if background_tasks is None:
        background_tasks = BackgroundTasks()
    """Get emails from DB"""
    # Trigger sync if empty
    trigger_sync_if_needed(current_user, db, background_tasks, force_check=False)

    emails = db.query(Email).filter(Email.user_id == current_user.id).order_by(Email.received_at.desc()).offset(offset).limit(limit).all()
    
    return [EmailResponse(
        id=e.id,
        from_email=e.sender,
        subject=e.subject,
        preview=e.preview,
        priority=e.priority,
        unread=e.is_read is False,
        timestamp=get_time_ago(e.received_at),
        time=get_time_ago(e.received_at),
        thread_id=e.thread_id
    ) for e in emails]

@router.get("/meetings", response_model=List[MeetingResponse])
async def get_meetings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get meetings from DB"""
    now = datetime.now()
    all_meetings = db.query(Meeting).filter(
        Meeting.user_id == current_user.id,
        Meeting.start_time >= now
    ).order_by(Meeting.start_time.asc()).limit(50).all()
    
    meetings = [m for m in all_meetings if not is_all_day_event(m)][:20]
    
    return [MeetingResponse(
        id=m.id,
        title=m.title,
        time=m.start_time.strftime("%I:%M %p") if m.start_time else "",
        duration="30 min",
        location=m.location or "Virtual",
        attendees=json.loads(m.attendees) if m.attendees else [],
        upcoming=True,
        date=m.start_time.isoformat() if m.start_time else None,
        start_datetime=m.start_time.isoformat() if m.start_time else None,
        end_datetime=m.end_time.isoformat() if m.end_time else None,
        description=m.description,
        meet_link=m.meet_link,
    ) for m in meetings]

@router.get("/todos", response_model=List[TodoResponse])
async def get_todos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's todos"""
    todos = db.query(Todo).filter(
        Todo.user_id == current_user.id,
        Todo.completed == False
    ).all()
    return [TodoResponse.model_validate(todo) for todo in todos]

@router.post("/todos", response_model=TodoResponse)
async def create_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new todo"""
    todo = Todo(
        user_id=current_user.id,
        task=todo_data.task,
        priority=todo_data.priority,
        due_date=todo_data.due_date,
        category=todo_data.category
    )
    db.add(todo)
    db.commit()
    # Invalidate dashboard cache
    try:
        cache.delete(f"dashboard:summary:{current_user.id}")
    except Exception:
        pass
    return TodoResponse.model_validate(todo)

@router.patch("/todos/{todo_id}", response_model=TodoResponse)
async def update_todo(
    todo_id: int,
    todo_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a todo"""
    todo = db.query(Todo).filter(
        Todo.id == todo_id,
        Todo.user_id == current_user.id
    ).first()
    
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    if todo_data.completed is not None:
        todo.completed = todo_data.completed
    if todo_data.task:
        todo.task = todo_data.task
    if todo_data.priority:
        todo.priority = todo_data.priority
    
    db.commit()
    db.refresh(todo)
    # Invalidate dashboard cache
    try:
        cache.delete(f"dashboard:summary:{current_user.id}")
    except Exception:
        pass
    return TodoResponse.model_validate(todo)

@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get notifications"""
    notifications = db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(20).all()
    
    return [
        NotificationResponse(
            id=notif.id,
            type=notif.type,
            message=notif.message,
            read=notif.read,
            time=get_time_ago(notif.created_at),
            related_id=notif.related_id
        ) for notif in notifications
    ]

@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark notification read"""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.read = True
    db.commit()
    return {"status": "success"}

