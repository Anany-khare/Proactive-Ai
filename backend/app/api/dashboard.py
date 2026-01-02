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
from datetime import datetime, timedelta, timezone
from typing import List
import json

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

def get_google_credentials(user: User, db: Session) -> dict:
    """Get decrypted Google credentials for user, refreshing if expired"""
    from app.core.config import settings
    from app.core.models import ServiceToken
    from app.core.google_auth import refresh_access_token
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    
    service_token = db.query(ServiceToken).filter(
        ServiceToken.user_id == user.id,
        ServiceToken.service_name == 'google'
    ).first()
    
    if not service_token:
        return None
    
    try:
        # Decrypt tokens
        access_token = ServiceToken.decrypt_token(service_token.access_token_encrypted)
        refresh_token = ServiceToken.decrypt_token(service_token.refresh_token_encrypted) if service_token.refresh_token_encrypted else None
        
        # Check if token is expired (check stored expiry or try to use credentials)
        needs_refresh = False
        if service_token.expires_at:
            # Check stored expiry time
            # Ensure expires_at is timezone-aware
            expiry = service_token.expires_at
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            
            if expiry < datetime.now(timezone.utc):
                needs_refresh = True
                print(f"Token expired for user {user.id} (expired at {service_token.expires_at})")
        else:
            # No expiry stored, create credentials and check if expired
            try:
                credentials = Credentials(
                    token=access_token,
                    refresh_token=refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=settings.GOOGLE_CLIENT_ID,
                    client_secret=settings.GOOGLE_CLIENT_SECRET
                )
                if credentials.expired:
                    needs_refresh = True
            except Exception:
                # If we can't check, assume it needs refresh if we have refresh token
                needs_refresh = bool(refresh_token)
        
        # Refresh token if expired
        if needs_refresh and refresh_token:
            try:
                credentials = Credentials(
                    token=None,
                    refresh_token=refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=settings.GOOGLE_CLIENT_ID,
                    client_secret=settings.GOOGLE_CLIENT_SECRET
                )
                credentials.refresh(Request())
                # Update stored token
                service_token.access_token_encrypted = ServiceToken.encrypt_token(credentials.token)
                if credentials.expiry:
                    service_token.expires_at = credentials.expiry
                db.commit()
                access_token = credentials.token
                print(f"Token refreshed successfully for user {user.id}")
            except Exception as e:
                print(f"Error refreshing token for user {user.id}: {e}")
                db.rollback()
                # Token refresh failed - user may need to re-authenticate
                return None
        
        credentials_dict = {
            "token": access_token,
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "scopes": [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.modify',
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/userinfo.profile'
            ]
        }
        
        if refresh_token:
            credentials_dict["refresh_token"] = refresh_token
        
        return credentials_dict
    except Exception as e:
        print(f"Error getting credentials: {e}")
        return None

@router.get("/contextual-data", response_model=DashboardData)
async def get_contextual_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all contextual dashboard data"""
    # Check cache first (but skip if it contains mock data)
    cache = db.query(DashboardCache).filter(DashboardCache.user_id == current_user.id).first()
    if cache and cache.last_updated:
        # Check if cache is still valid (5 minutes)
        # Make sure both datetimes are timezone-aware
        now = datetime.now(timezone.utc)
        cache_time = cache.last_updated
        if cache_time.tzinfo is None:
            # If cache time is naive, assume it's UTC
            cache_time = cache_time.replace(tzinfo=timezone.utc)
        # Check if cache is fresh (5 minutes)
        cache_age_seconds = (now - cache_time).total_seconds()
        if cache_age_seconds < 300:
            # Cache is fresh - check if it contains mock data
            cache_data = cache.data if isinstance(cache.data, dict) else {}
            cache_emails = cache_data.get('emails', [])
            has_mock_data = False
            if cache_emails:
                # Only check for mock data if emails exist
                has_mock_data = any(
                    str(email.get('id', '')).startswith('mock-') or 
                    email.get('from_email', '') in ['Sarah Chen', 'Mike Johnson']
                    for email in cache_emails
                )
            
            # Only use cache if it doesn't contain mock data
            if not has_mock_data:
                print(f"Using cached data (age: {cache_age_seconds:.0f}s)")
                return DashboardData(**cache.data)
            else:
                # Invalidate cache if it has mock data
                print("Cache contains mock data, invalidating and fetching fresh data...")
                db.delete(cache)
                db.commit()
        else:
            # Cache is stale, will fetch fresh data
            print(f"Cache expired (age: {cache_age_seconds:.0f}s), fetching fresh data...")
    
    # Fetch fresh data
    emails = []
    meetings = []
    
    # Try to fetch from Google services
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        print(f"No Google credentials found for user {current_user.id}")
    else:
        print(f"Fetching emails and meetings for user {current_user.id}...")
        
        # Fetch emails - try unread first, then fallback to recent if no unread
        try:
            gmail_service = GmailService(credentials)
            
            # First try to get unread emails
            emails_data = gmail_service.get_unread_emails(max_results=5)
            print(f"Unread emails: {len(emails_data) if emails_data else 0}")
            
            # If no unread emails, get recent emails (read and unread)
            if not emails_data or len(emails_data) == 0:
                print("No unread emails, fetching recent emails instead...")
                emails_data = gmail_service.get_recent_emails(max_results=5)
                print(f"Recent emails: {len(emails_data) if emails_data else 0}")
            
            if emails_data and len(emails_data) > 0:
                emails = [EmailResponse(
                    id=email.get('id', ''), 
                    from_email=email.get('from', 'Unknown'), 
                    subject=email.get('subject', ''), 
                    preview=email.get('preview', ''), 
                    priority=email.get('priority', 'medium'),
                    unread=email.get('unread', True), 
                    timestamp=email.get('time', ''),
                    time=email.get('time', ''),
                    thread_id=email.get('thread_id')  # Extract thread_id from email data
                ) for email in emails_data]
                print(f"Successfully converted {len(emails)} emails to EmailResponse objects")
            else:
                print("No emails found in Gmail")
                emails = []  # Empty list if no emails at all
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"ERROR fetching emails from Gmail for user {current_user.id}")
            print(f"Error type: {type(e).__name__}")
            print(f"Error message: {str(e)}")
            print(f"Full traceback:\n{error_details}")
            # Return empty list on error, but log it clearly
            emails = []
            # Don't raise - allow dashboard to load with empty email list
        
        # Fetch meetings
        try:
            calendar_service = CalendarService(credentials)
            meetings_data = calendar_service.get_upcoming_events(max_results=3)
            print(f"Fetched {len(meetings_data) if meetings_data else 0} meetings from Calendar")
            if meetings_data:
                meetings = [MeetingResponse(**meeting) for meeting in meetings_data]
            else:
                print("No meetings returned from Calendar API")
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"ERROR fetching meetings from Calendar for user {current_user.id}: {e}")
            print(f"Traceback: {error_details}")
            # Don't fall back to mock data - return empty list instead
            meetings = []
    
    print(f"Returning {len(emails)} emails and {len(meetings)} meetings for user {current_user.id}")
    
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
        date=datetime.now(timezone.utc).strftime('%A, %B %d, %Y')
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
    now = datetime.now(timezone.utc)
    if cache:
        cache.data = dashboard_data.dict()
        cache.last_updated = now
    else:
        cache = DashboardCache(
            user_id=current_user.id,
            data=dashboard_data.dict(),
            last_updated=now
        )
        db.add(cache)
    db.commit()
    
    return dashboard_data

def get_mock_emails() -> List[EmailResponse]:
    """Return mock emails when service unavailable"""
    return [
        EmailResponse(
            id="mock-1",
            from_email="Sarah Chen",
            subject="Q4 Project Review - Action Required",
            preview="Hi, we need to finalize the Q4 review document by end of day...",
            priority="high",
            unread=True,
            timestamp="2 hours ago",
            time="2 hours ago",
            thread_id=None
        ),
        EmailResponse(
            id="mock-2",
            from_email="Mike Johnson",
            subject="Re: Budget Approval",
            preview="The budget has been approved. Please proceed with...",
            priority="medium",
            unread=True,
            timestamp="4 hours ago",
            time="4 hours ago",
            thread_id=None
        )
    ]

def get_mock_meetings() -> List[MeetingResponse]:
    """Return mock meetings when service unavailable"""
    return [
        MeetingResponse(
            id="mock-1",
            title="Team Standup",
            time="10:00 AM",
            duration="30 min",
            location="Conference Room A",
            attendees=["Sarah", "Mike", "Alex"],
            upcoming=True,
            date=None,
            start_datetime=None,
            end_datetime=None,
            description=None
        ),
        MeetingResponse(
            id="mock-2",
            title="Client Presentation",
            time="3:00 PM",
            duration="1 hour",
            location="Virtual",
            attendees=["Client Team"],
            upcoming=True,
            date=None,
            start_datetime=None,
            end_datetime=None,
            description=None
        )
    ]

def get_time_ago(dt: datetime) -> str:
    """Calculate time ago string"""
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
    # Check cache first
    cache = db.query(DashboardCache).filter(DashboardCache.user_id == current_user.id).first()
    if cache and cache.last_updated:
        # Check if cache is fresh (5 minutes)
        now = datetime.now(timezone.utc)
        cache_time = cache.last_updated
        if cache_time.tzinfo is None:
            cache_time = cache_time.replace(tzinfo=timezone.utc)
            
        if (now - cache_time).total_seconds() < 300:
            cache_data = cache.data if isinstance(cache.data, dict) else {}
            if 'emails' in cache_data and cache_data['emails']:
                print(f"Returning cached emails for user {current_user.id}")
                # Convert dict back to EmailResponse objects
                return [EmailResponse(**e) for e in cache_data['emails']]

    credentials = get_google_credentials(current_user, db)
    if not credentials:
        # Return empty list instead of mock data when no credentials
        return []
    
    try:
        gmail_service = GmailService(credentials)
        
        # Try unread first, then recent if no unread
        print(f"Fetching fresh emails for user {current_user.id}...")
        emails_data = gmail_service.get_unread_emails(max_results=10)
        if not emails_data or len(emails_data) == 0:
            emails_data = gmail_service.get_recent_emails(max_results=10)
        
        if not emails_data:
            return []
            
        emails_response = [EmailResponse(
            id=email.get('id', ''), 
            from_email=email.get('from', 'Unknown'), 
            subject=email.get('subject', ''), 
            preview=email.get('preview', ''), 
            priority=email.get('priority', 'medium'),
            unread=email.get('unread', True), 
            timestamp=email.get('time', ''),
            time=email.get('time', ''),
            thread_id=email.get('thread_id')
        ) for email in emails_data]

        # Update cache
        try:
            now = datetime.now(timezone.utc)
            if cache:
                cache_data = cache.data if isinstance(cache.data, dict) else {}
                cache_data['emails'] = [e.dict() for e in emails_response]
                cache.data = cache_data
                cache.last_updated = now
            else:
                # If no cache exists, we can't easily create one without other data
                # So we leave it for the main dashboard endpoint to create
                pass
            db.commit()
        except Exception as e:
            print(f"Failed to update cache: {e}")
            # Continue even if cache update fails
        
        return emails_response
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error fetching emails: {e}")
        print(f"Traceback: {error_details}")
        # Return empty list instead of mock data on error
        # This way the user knows something went wrong rather than seeing fake data
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch emails: {str(e)}"
        )

@router.get("/meetings", response_model=List[MeetingResponse])
async def get_meetings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's upcoming meetings"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        # Return empty list instead of mock data when no credentials
        return []
    
    try:
        calendar_service = CalendarService(credentials)
        meetings_data = calendar_service.get_upcoming_events(max_results=10)
        if not meetings_data:
            return []
        
        return [MeetingResponse(**meeting) for meeting in meetings_data]
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error fetching meetings: {e}")
        print(f"Traceback: {error_details}")
        # Return empty list instead of mock data on error
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch meetings: {str(e)}"
        )

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

