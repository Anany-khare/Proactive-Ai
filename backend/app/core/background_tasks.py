from celery import Celery
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.models import User, ServiceToken, DashboardCache, Notification, Email, Meeting
from app.core.google_services import GmailService, CalendarService
from app.core.google_utils import get_google_credentials
from datetime import datetime, timedelta
# import redis # Removed
import json
from app.core.cache import cache
from dateutil import parser as date_parser

# Initialize Celery
celery_app = Celery(
    'tasks',
    broker=settings.CELERY_BROKER_URL or 'redis://localhost:6379/0',
    backend=settings.CELERY_RESULT_BACKEND or 'redis://localhost:6379/0'
)



def parse_iso_datetime(dt_str):
    if not dt_str:
        return None
    try:
        return date_parser.parse(dt_str)
    except:
        return None

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
        
        updates_made = False
        
        # Sync emails
        try:
            gmail_service = GmailService(credentials)
            # Fetch more emails for DB
            emails_data = gmail_service.get_unread_emails(max_results=50)
            if not emails_data:
                emails_data = gmail_service.get_recent_emails(max_results=20)
                
            if emails_data:
                for email_data in emails_data:
                    # Check if email exists
                    email_id = email_data.get('id')
                    existing_email = db.query(Email).filter(Email.id == email_id).first()
                    
                    received_at = parse_iso_datetime(email_data.get('time') or email_data.get('timestamp'))
                    
                    if not existing_email:
                        new_email = Email(
                            id=email_id,
                            user_id=user.id,
                            thread_id=email_data.get('thread_id'),
                            subject=email_data.get('subject'),
                            sender=email_data.get('from'),
                            preview=email_data.get('preview'),
                            received_at=received_at,
                            is_read=not email_data.get('unread', True), # API returns unread=True
                            priority=email_data.get('priority', 'medium')
                        )
                        db.add(new_email)
                        updates_made = True
                        
                        # Check for high priority notifications
                        if new_email.priority == 'high' and not new_email.is_read:
                             # Check duplicate notification
                            existing_notif = db.query(Notification).filter(
                                Notification.user_id == user.id,
                                Notification.type == 'email',
                                Notification.related_id == int(email_id, 16) if email_id.isdigit() else None # Basic check, id is string actually. Notification related_id is Int... Schema mismatch. Fixing in Notification later?
                                # For now skipping related_id link strictly or use hash
                            ).first()
                            
                            # Simple notification creation without strict related_id integer constraint
                            notif = Notification(
                                user_id=user.id,
                                type='email',
                                message=f"New high-priority email: {new_email.subject}",
                                read=False
                            )
                            db.add(notif)

                    else:
                        # Update existing
                        existing_email.is_read = not email_data.get('unread', True)
                        # Could update other fields if they changed

        except Exception as e:
            print(f"Error syncing emails for user {user_id}: {e}")
        
        # Sync calendar events
        try:
            calendar_service = CalendarService(credentials)
            meetings_data = calendar_service.get_upcoming_events(max_results=20)
            
            if meetings_data:
                for meeting_data in meetings_data:
                    meeting_id = meeting_data.get('id')
                    existing_meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
                    
                    start_time = parse_iso_datetime(meeting_data.get('start_datetime') or meeting_data.get('date'))
                    end_time = parse_iso_datetime(meeting_data.get('end_datetime'))
                    
                    if not existing_meeting:
                        new_meeting = Meeting(
                            id=meeting_id,
                            user_id=user.id,
                            title=meeting_data.get('title'),
                            start_time=start_time,
                            end_time=end_time,
                            location=meeting_data.get('location'),
                            description=meeting_data.get('description'),
                            attendees=json.dumps(meeting_data.get('attendees', []))
                        )
                        db.add(new_meeting)
                        updates_made = True
                    else:
                        # Update
                        existing_meeting.start_time = start_time
                        existing_meeting.end_time = end_time
                        existing_meeting.title = meeting_data.get('title')
        
        except Exception as e:
            print(f"Error syncing calendar for user {user_id}: {e}")
        
        db.commit()
        
        # Update last_synced_at
        user.last_synced_at = datetime.now()
        db.commit()
        
        # Cache Invalidation & Realtime Update
        if updates_made:
            # 1. Invalidate Dashboard Cache (Force re-compute on next read)
            try:
                cache_key = f"dashboard:summary:{user_id}"
                redis_client.delete(cache_key)
            except Exception as e:
                print(f"Redis cleanup error (safe to ignore): {e}")
            
            # 2. Publish Realtime Event
            update_event = {
                "type": "REFRESH_DASHBOARD",
                "user_id": user_id,
                "timestamp": datetime.now().isoformat()
            }
            # Publish to user's specific channel
            redis_client.publish(f"updates:{user_id}", json.dumps(update_event))
            print(f"Synced data for user {user_id} and published update event.")
        
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

