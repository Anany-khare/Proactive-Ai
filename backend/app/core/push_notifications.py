"""
Push Notification Service
Handles browser push notifications for important events
"""
from app.core.models import PushSubscription, Notification
from sqlalchemy.orm import Session
from typing import List, Optional
import json

# Note: For production, you'll need to:
# 1. Generate VAPID keys
# 2. Install pywebpush: pip install pywebpush
# 3. Configure VAPID keys in settings
# 4. Set up service worker on frontend

class PushNotificationService:
    """Service for sending push notifications"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def send_notification(
        self, 
        user_id: int, 
        title: str, 
        body: str, 
        icon: str = None,
        badge: str = None,
        data: dict = None
    ) -> bool:
        """
        Send push notification to user
        Returns True if sent successfully, False otherwise
        """
        try:
            # Get user's push subscriptions
            subscriptions = self.db.query(PushSubscription).filter(
                PushSubscription.user_id == user_id
            ).all()
            
            if not subscriptions:
                return False
            
            # Prepare notification payload
            payload = {
                "title": title,
                "body": body,
                "icon": icon or "/icon-192x192.png",
                "badge": badge or "/badge-72x72.png",
                "data": data or {}
            }
            
            # TODO: Implement actual push notification sending
            # This requires:
            # 1. VAPID keys setup
            # 2. pywebpush library
            # 3. Service worker registration
            
            # For now, we'll just log it
            print(f"Push notification for user {user_id}: {title} - {body}")
            
            # In production, uncomment and implement:
            # from pywebpush import webpush, WebPushException
            # for subscription in subscriptions:
            #     try:
            #         webpush(
            #             subscription_info={
            #                 "endpoint": subscription.endpoint,
            #                 "keys": {
            #                     "p256dh": subscription.p256dh,
            #                     "auth": subscription.auth
            #                 }
            #             },
            #             data=json.dumps(payload),
            #             vapid_private_key=settings.VAPID_PRIVATE_KEY,
            #             vapid_claims={
            #                 "sub": f"mailto:{settings.VAPID_ADMIN_EMAIL}"
            #             }
            #         )
            #     except WebPushException as e:
            #         print(f"Error sending push notification: {e}")
            #         # Remove invalid subscription
            #         self.db.delete(subscription)
            
            return True
        except Exception as e:
            print(f"Error in push notification service: {e}")
            return False
    
    def send_email_notification(self, user_id: int, email_subject: str, from_email: str, priority: str = "medium"):
        """Send push notification for new high-priority email"""
        if priority == "high":
            return self.send_notification(
                user_id=user_id,
                title="High Priority Email",
                body=f"New email from {from_email}: {email_subject}",
                data={"type": "email", "priority": priority}
            )
        return False
    
    def send_meeting_notification(self, user_id: int, meeting_title: str, meeting_time: str):
        """Send push notification for upcoming meeting"""
        return self.send_notification(
            user_id=user_id,
            title="Upcoming Meeting",
            body=f"{meeting_title} at {meeting_time}",
            data={"type": "meeting", "time": meeting_time}
        )
    
    def send_meeting_reminder(self, user_id: int, meeting_title: str, minutes_before: int = 15):
        """Send push notification for meeting reminder"""
        return self.send_notification(
            user_id=user_id,
            title="Meeting Reminder",
            body=f"{meeting_title} starts in {minutes_before} minutes",
            data={"type": "meeting_reminder", "minutes": minutes_before}
        )
