from celery import Celery
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.models import User, ServiceToken, DashboardCache, Notification
from app.core.google_services import GmailService, CalendarService
from app.api.dashboard import get_google_credentials
from datetime import datetime, timedelta

# Initialize Celery
celery_app = Celery(
    'tasks',
    broker=settings.CELERY_BROKER_URL or 'redis://localhost:6379/0',
    backend=settings.CELERY_RESULT_BACKEND or 'redis://localhost:6379/0'
)

@celery_app.task
def sync_user_data(user_id: int):
    """Background task to sync user data from Google services"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return
        
        credentials = get_google_credentials(user, db)
        if not credentials:
            return
        
        # Sync emails
        try:
            gmail_service = GmailService(credentials)
            emails = gmail_service.get_unread_emails(max_results=10)
            
            # Create notifications for high-priority emails
            for email in emails:
                if email.get('priority') == 'high':
                    # Check if notification already exists
                    existing = db.query(Notification).filter(
                        Notification.user_id == user.id,
                        Notification.type == 'email',
                        Notification.message.contains(email.get('subject', ''))
                    ).first()
                    
                    if not existing:
                        notification = Notification(
                            user_id=user.id,
                            type='email',
                            message=f"New high-priority email from {email.get('from', 'Unknown')}",
                            related_id=email.get('id')
                        )
                        db.add(notification)
        except Exception as e:
            print(f"Error syncing emails for user {user_id}: {e}")
        
        # Sync calendar events
        try:
            calendar_service = CalendarService(credentials)
            meetings = calendar_service.get_upcoming_events(max_results=10)
            
            # Create meeting reminders (15 minutes before)
            now = datetime.now()
            for meeting in meetings:
                try:
                    # Parse meeting time
                    meeting_time_str = meeting.get('time', '')
                    # Simple time parsing (you may need to improve this)
                    # For now, we'll just create a general reminder
                    notification = Notification(
                        user_id=user.id,
                        type='meeting',
                        message=f"{meeting.get('title', 'Meeting')} starts soon at {meeting.get('time', '')}",
                        related_id=meeting.get('id')
                    )
                    db.add(notification)
                except Exception as e:
                    print(f"Error creating meeting reminder: {e}")
        except Exception as e:
            print(f"Error syncing calendar for user {user_id}: {e}")
        
        db.commit()
        
        # Invalidate dashboard cache to force refresh
        cache = db.query(DashboardCache).filter(DashboardCache.user_id == user.id).first()
        if cache:
            cache.last_updated = datetime.now() - timedelta(hours=1)  # Make it stale
            db.commit()
        
    except Exception as e:
        print(f"Error in sync_user_data for user {user_id}: {e}")
        db.rollback()
    finally:
        db.close()

@celery_app.task
def sync_all_users():
    """Sync data for all users with connected services"""
    db = SessionLocal()
    try:
        users = db.query(User).join(ServiceToken).filter(
            ServiceToken.service_name == 'google'
        ).all()
        
        for user in users:
            sync_user_data.delay(user.id)
    finally:
        db.close()

# Schedule periodic tasks (runs every 5 minutes)
celery_app.conf.beat_schedule = {
    'sync-all-users': {
        'task': 'app.core.background_tasks.sync_all_users',
        'schedule': 300.0,  # 5 minutes
    },
}

