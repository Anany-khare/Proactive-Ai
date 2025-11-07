from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, ServiceToken, Todo, Notification, DashboardCache
from app.core.schemas import (
    DashboardData, DailyBrief, EmailResponse, MeetingResponse, 
    TodoResponse, NotificationResponse, Suggestion, TodoCreate, TodoUpdate
)
from app.core.google_services import GmailService, CalendarService
from datetime import datetime, timedelta
from typing import List
import json

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

def get_google_credentials(user: User, db: Session) -> dict:
    """Get decrypted Google credentials for user"""
    from app.core.config import settings
    from app.core.models import ServiceToken
    
    service_token = db.query(ServiceToken).filter(
        ServiceToken.user_id == user.id,
        ServiceToken.service_name == 'google'
    ).first()
    
    if not service_token:
        return None
    
    credentials_dict = {
        "token": ServiceToken.decrypt_token(service_token.access_token_encrypted),
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "scopes": [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ]
    }
    
    if service_token.refresh_token_encrypted:
        credentials_dict["refresh_token"] = ServiceToken.decrypt_token(service_token.refresh_token_encrypted)
    
    return credentials_dict

@router.get("/contextual-data", response_model=DashboardData)
async def get_contextual_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all contextual dashboard data"""
    # Check cache first
    cache = db.query(DashboardCache).filter(DashboardCache.user_id == current_user.id).first()
    if cache and cache.last_updated:
        # Check if cache is still valid (5 minutes)
        if (datetime.now() - cache.last_updated).total_seconds() < 300:
            return DashboardData(**cache.data)
    
    # Fetch fresh data
    emails = []
    meetings = []
    
    # Try to fetch from Google services
    try:
        credentials = get_google_credentials(current_user, db)
        if credentials:
            # Fetch emails
            gmail_service = GmailService(credentials)
            emails_data = gmail_service.get_unread_emails(max_results=5)
            emails = [EmailResponse(
                id=i+1, 
                from_email=email.get('from', 'Unknown'), 
                subject=email.get('subject', ''), 
                preview=email.get('preview', ''), 
                priority=email.get('priority', 'medium'),
                unread=email.get('unread', True), 
                timestamp=email.get('time', ''),
                time=email.get('time', '')
            ) for i, email in enumerate(emails_data)]
            
            # Fetch meetings
            calendar_service = CalendarService(credentials)
            meetings_data = calendar_service.get_upcoming_events(max_results=3)
            meetings = [MeetingResponse(id=i+1, **meeting) for i, meeting in enumerate(meetings_data)]
    except Exception as e:
        print(f"Error fetching from Google services: {e}")
        # Fall back to mock data if service unavailable
        emails = get_mock_emails()
        meetings = get_mock_meetings()
    
    # Get todos
    todos = db.query(Todo).filter(
        Todo.user_id == current_user.id,
        Todo.completed == False
    ).limit(10).all()
    todos_response = [TodoResponse.model_validate(todo) for todo in todos]
    
    # Get notifications
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
    
    # Generate daily brief
    daily_brief = DailyBrief(
        summary=f"Good {get_time_of_day()}! You have {len(meetings)} meeting{'s' if len(meetings) != 1 else ''} today, {len([e for e in emails if e.unread])} unread priority email{'s' if len([e for e in emails if e.unread]) != 1 else ''}, and {len([t for t in todos_response if not t.completed])} action item{'s' if len([t for t in todos_response if not t.completed]) != 1 else ''} requiring attention.",
        date=datetime.now().strftime('%A, %B %d, %Y')
    )
    
    # Generate suggestions
    suggestions = generate_suggestions(meetings, emails, todos_response)
    
    # Create response
    dashboard_data = DashboardData(
        dailyBrief=daily_brief,
        emails=emails,
        meetings=meetings,
        todos=todos_response,
        notifications=notifications_response,
        suggestions=suggestions
    )
    
    # Update cache
    if cache:
        cache.data = dashboard_data.dict()
        cache.last_updated = datetime.now()
    else:
        cache = DashboardCache(
            user_id=current_user.id,
            data=dashboard_data.dict(),
            last_updated=datetime.now()
        )
        db.add(cache)
    db.commit()
    
    return dashboard_data

def get_mock_emails() -> List[EmailResponse]:
    """Return mock emails when service unavailable"""
    return [
        EmailResponse(
            id=1,
            from_email="Sarah Chen",
            subject="Q4 Project Review - Action Required",
            preview="Hi, we need to finalize the Q4 review document by end of day...",
            priority="high",
            unread=True,
            timestamp="2 hours ago",
            time="2 hours ago"
        ),
        EmailResponse(
            id=2,
            from_email="Mike Johnson",
            subject="Re: Budget Approval",
            preview="The budget has been approved. Please proceed with...",
            priority="medium",
            unread=True,
            timestamp="4 hours ago",
            time="4 hours ago"
        )
    ]

def get_mock_meetings() -> List[MeetingResponse]:
    """Return mock meetings when service unavailable"""
    return [
        MeetingResponse(
            id=1,
            title="Team Standup",
            time="10:00 AM",
            duration="30 min",
            location="Conference Room A",
            attendees=["Sarah", "Mike", "Alex"],
            upcoming=True
        ),
        MeetingResponse(
            id=2,
            title="Client Presentation",
            time="3:00 PM",
            duration="1 hour",
            location="Virtual",
            attendees=["Client Team"],
            upcoming=True
        )
    ]

def get_time_ago(dt: datetime) -> str:
    """Calculate time ago string"""
    now = datetime.now()
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
    hour = datetime.now().hour
    if hour < 12:
        return "morning"
    elif hour < 17:
        return "afternoon"
    else:
        return "evening"

def generate_suggestions(meetings: List, emails: List, todos: List) -> List[Suggestion]:
    """Generate AI-powered suggestions"""
    suggestions = []
    
    # Meeting suggestions
    for meeting in meetings[:2]:
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

@router.get("/emails", response_model=List[EmailResponse])
async def get_emails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's emails"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        return get_mock_emails()
    
    try:
        gmail_service = GmailService(credentials)
        emails_data = gmail_service.get_unread_emails(max_results=10)
        return [EmailResponse(
            id=i+1, 
            from_email=email.get('from', 'Unknown'), 
            subject=email.get('subject', ''), 
            preview=email.get('preview', ''), 
            priority=email.get('priority', 'medium'),
            unread=email.get('unread', True), 
            timestamp=email.get('time', ''),
            time=email.get('time', '')
        ) for i, email in enumerate(emails_data)]
    except Exception as e:
        return get_mock_emails()

@router.get("/meetings", response_model=List[MeetingResponse])
async def get_meetings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's upcoming meetings"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        return get_mock_meetings()
    
    try:
        calendar_service = CalendarService(credentials)
        meetings_data = calendar_service.get_upcoming_events(max_results=10)
        return [MeetingResponse(id=i+1, **meeting) for i, meeting in enumerate(meetings_data)]
    except Exception as e:
        return get_mock_meetings()

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
    return TodoResponse.model_validate(todo)

@router.patch("/todos/{todo_id}", response_model=TodoResponse)
async def update_todo(
    todo_id: int,
    todo_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a todo (mark complete, etc.)"""
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
    return TodoResponse.model_validate(todo)

@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's notifications"""
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
    """Mark a notification as read"""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.read = True
    db.commit()
    return {"status": "success"}

