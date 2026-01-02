from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, ServiceToken, Todo, Notification, Email, Meeting
from app.core.schemas import (
    DashboardData, DailyBrief, EmailResponse, MeetingResponse, 
    TodoResponse, NotificationResponse, Suggestion, TodoCreate, TodoUpdate
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

def generate_suggestions(meetings: List[MeetingResponse], emails: List[EmailResponse], todos: List[TodoResponse]) -> List[Suggestion]:
    """Generate AI-powered suggestions"""
    suggestions = []
    
    # Meeting suggestions
    if meetings:
        meeting = meetings[0]
        suggestions.append(Suggestion(
            id=len(suggestions) + 1,
            type="preparation",
            message=f"Review materials for {meeting.title} at {meeting.time}",
            action="Prepare"
        ))
    
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
    
    return suggestions

@router.get("/contextual-data", response_model=DashboardData, dependencies=[Depends(RateLimiter("dashboard", 60))])
async def get_contextual_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all contextual dashboard data (Cached + DB Read Only)"""
    
    # 1. Try Cache
    try:
        cache_key = f"dashboard:summary:{current_user.id}"
        cached_data = redis_client.get(cache_key)
        
        if cached_data:
            try:
                return DashboardData(**json.loads(cached_data))
            except Exception as e:
                print(f"Cache parse error: {e}")
    except Exception as e:
        print(f"Redis cache error: {e}")
    
    print(f"Cache miss for user {current_user.id}, computing from DB...")
    
    # 2. Fetch from DB (Fast!)
    # Emails
    db_emails = db.query(Email).filter(Email.user_id == current_user.id).order_by(Email.received_at.desc()).limit(10).all()
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
    db_meetings = db.query(Meeting).filter(
        Meeting.user_id == current_user.id,
        Meeting.start_time >= now
    ).order_by(Meeting.start_time.asc()).limit(5).all()
    
    meetings_response = [MeetingResponse(
        id=m.id,
        title=m.title,
        time=m.start_time.strftime("%I:%M %p") if m.start_time else "",
        duration="30 min", # Placeholder
        location=m.location or "Virtual",
        attendees=json.loads(m.attendees) if m.attendees else [],
        upcoming=True,
        date=m.start_time.isoformat() if m.start_time else None,
        start_datetime = m.start_time,
        end_datetime = m.end_time,
        description=m.description
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
    
    # Daily Brief
    daily_brief = DailyBrief(
        summary=f"Good {get_time_of_day()}! You have {len(meetings_response)} meeting{'s' if len(meetings_response) != 1 else ''} upcoming, {len([e for e in emails_response if e.unread])} unread priority email{'s' if len([e for e in emails_response if e.unread]) != 1 else ''}.",
        date=datetime.now(timezone.utc).strftime('%A, %B %d, %Y')
    )
    
    # Suggestions
    suggestions = generate_suggestions(meetings_response, emails_response, todos_response)
    
    dashboard_data = DashboardData(
        dailyBrief=daily_brief,
        emails=emails_response,
        meetings=meetings_response,
        todos=todos_response,
        notifications=notifications_response,
        suggestions=suggestions
    )
    
    # 3. Cache Result (10 mins)
    try:
        redis_client.setex(cache_key, 600, json.dumps(dashboard_data.dict(), default=str))
    except Exception as e:
        print(f"Redis set error: {e}")

    # 4. Trigger Background Sync (Safe Strategy with Circuit Breaker)
    # Circuit Breaker Logic:
    # 1. Redis Lock (Fast, 5 min TTL) - Primary Check
    # 2. DB last_synced_at (Reliable, 5 min window) - Fallback Check
    
    should_trigger_sync = False
    
    # If DB is empty, user needs data immediately
    if not db_emails and not db_meetings:
        should_trigger_sync = True
    else:
        # Check staleness if data exists
        if current_user.last_synced_at:
             # If synced more than 5 mins ago
             time_since_sync = datetime.now() - current_user.last_synced_at.replace(tzinfo=None) # naive comparison for simplicity
             if time_since_sync.total_seconds() > 300:
                 should_trigger_sync = True
        else:
             # Never synced (but has data? maybe from migration), trigger sync
             should_trigger_sync = True

    if should_trigger_sync:
        sync_lock_key = f"sync:locked:{current_user.id}"
        
        # Check Redis Lock first (Fastest)
        if not cache.exists(sync_lock_key):
            # Double check DB timestamp to prevent loop if Redis flushed
            # (Already checked above via last_synced_at logic)
            
            print(f"Triggering background sync for user {current_user.id}...")
            try:
                sync_user_data.delay(current_user.id)
                
                # Set Redis Lock for 5 mins
                cache.set(sync_lock_key, "1", ex=300)
                
                # Optimistically update DB last_synced_at to prevent immediate retry 
                # (Background task will update it again on success, but this prevents rapid-fire triggers if DB is slow)
                # Actually, better to let background task handle DB update to ensure 'success' meaning.
                # But to act as a DB-lock, we need to respect the *previous* success time.
                pass 
            except Exception as e:
                print(f"Background sync trigger failed: {e}")

    return dashboard_data

@router.get("/emails", response_model=List[EmailResponse], dependencies=[Depends(RateLimiter("emails", 100))])
async def get_emails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 20,
    offset: int = 0
):
    """Get emails from DB"""
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
    meetings = db.query(Meeting).filter(
        Meeting.user_id == current_user.id,
        Meeting.start_time >= now
    ).order_by(Meeting.start_time.asc()).limit(20).all()
    
    return [MeetingResponse(
        id=m.id,
        title=m.title,
        time=m.start_time.strftime("%I:%M %p") if m.start_time else "",
        duration="30 min",
        location=m.location or "Virtual",
        attendees=json.loads(m.attendees) if m.attendees else [],
        upcoming=True,
        date=m.start_time.isoformat() if m.start_time else None,
        start_datetime = m.start_time,
        end_datetime = m.end_time,
        description=m.description
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
    db.refresh(todo)
    # Invalidate dashboard cache
    redis_client.delete(f"dashboard:summary:{current_user.id}")
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
    redis_client.delete(f"dashboard:summary:{current_user.id}")
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

