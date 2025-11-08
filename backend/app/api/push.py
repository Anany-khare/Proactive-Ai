from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, PushSubscription
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/push", tags=["push"])

class PushSubscriptionRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

@router.post("/subscribe")
async def subscribe_push(
    subscription: PushSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Register a push notification subscription"""
    try:
        # Check if subscription already exists
        existing = db.query(PushSubscription).filter(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == subscription.endpoint
        ).first()
        
        if existing:
            # Update existing subscription
            existing.p256dh = subscription.p256dh
            existing.auth = subscription.auth
        else:
            # Create new subscription
            push_sub = PushSubscription(
                user_id=current_user.id,
                endpoint=subscription.endpoint,
                p256dh=subscription.p256dh,
                auth=subscription.auth
            )
            db.add(push_sub)
        
        db.commit()
        return {"status": "success", "message": "Push subscription registered"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error registering push subscription: {str(e)}"
        )

@router.delete("/unsubscribe")
async def unsubscribe_push(
    endpoint: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unregister a push notification subscription"""
    try:
        subscription = db.query(PushSubscription).filter(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == endpoint
        ).first()
        
        if subscription:
            db.delete(subscription)
            db.commit()
            return {"status": "success", "message": "Push subscription removed"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found"
            )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error removing push subscription: {str(e)}"
        )

@router.get("/subscriptions")
async def get_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's push notification subscriptions"""
    try:
        subscriptions = db.query(PushSubscription).filter(
            PushSubscription.user_id == current_user.id
        ).all()
        
        return {
            "status": "success",
            "subscriptions": [
                {
                    "id": sub.id,
                    "endpoint": sub.endpoint,
                    "created_at": sub.created_at.isoformat() if sub.created_at else None
                }
                for sub in subscriptions
            ]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching subscriptions: {str(e)}"
        )
