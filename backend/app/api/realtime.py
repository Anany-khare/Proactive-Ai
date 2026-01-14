from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.models import User as UserModel, User
from app.core.security import verify_token
# from app.api.dashboard import get_google_credentials # This should be removed if present
from app.core.dependencies import get_current_user
from app.core.config import settings
import asyncio
import json
import logging
from typing import AsyncGenerator
from app.core.cache import cache
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/realtime", tags=["realtime"])

# Initialize Redis (Removed, using global cache)
# redis_client = ...


async def event_generator(user_id: int, db: Session) -> AsyncGenerator[str, None]:
    """Generate Server-Sent Events using Redis Pub/Sub"""
    try:
        # Send initial connection status
        yield f"data: {json.dumps({'type': 'status', 'status': 'connected', 'message': 'Real-time updates active'})}\n\n"
        
        if not cache.enabled:
             # Redis down fallback -> Polling Mode
             logger.warning("Redis unavailable. using DB polling fallback.")
             yield f"data: {json.dumps({'type': 'status', 'status': 'connected', 'message': 'Live updates active (Polling)'})}\n\n"
             
             from app.core.models import Email
             
             last_latest_id = None
             last_unread_count = -1
             
             while True:
                try:
                    # Check latest email
                    latest_email = db.query(Email).filter(Email.user_id == user_id).order_by(Email.received_at.desc()).first()
                    current_latest_id = latest_email.id if latest_email else None
                    
                    # Check unread count
                    current_unread_count = db.query(Email).filter(Email.user_id == user_id, Email.is_read == False).count()
                    
                    if last_latest_id is not None:
                        if current_latest_id != last_latest_id or current_unread_count != last_unread_count:
                             # Change detected!
                             yield f"data: {json.dumps({'type': 'emails', 'data': {'count': current_unread_count}})}\n\n"
                    
                    last_latest_id = current_latest_id
                    last_unread_count = current_unread_count
                    
                except Exception as e:
                    logger.error(f"Polling error: {e}")
                    # Don't break, just wait and retry
                    
                await asyncio.sleep(3)
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        
        # Start background poller for "Live" experience
        from app.core.background_tasks import sync_user_data
        
        async def sync_poller():
            while True:
                try:
                    # Check lock to respect rate limit
                    lock_key = f"sync:locked:{user_id}"
                    if not await redis_client.exists(lock_key):
                        # Set lock
                        await redis_client.set(lock_key, "1", ex=30) 
                        # Run sync in thread (blocking I/O)
                        await asyncio.to_thread(sync_user_data, user_id)
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    logger.error(f"Poller error: {e}")
                
                await asyncio.sleep(15) # Poll every 15s

        poller_task = asyncio.create_task(sync_poller())

        try:
            pubsub = redis_client.pubsub()
            channel = f"updates:{user_id}"
            await pubsub.subscribe(channel)

            try:
                async for message in pubsub.listen():
                    if message['type'] == 'message':
                        data = message['data']
                        yield f"data: {data}\n\n"
            except asyncio.CancelledError:
                raise
            finally:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
        finally:
            poller_task.cancel()
            try:
                await poller_task
            except asyncio.CancelledError:
                pass
            await redis_client.close()
            
    except Exception as e:
        logger.error(f"Realtime error: {e}")
        yield f"data: {json.dumps({
            'type': 'error',
            'message': 'Realtime service error'
        })}\n\n"

async def get_user_from_request(request: Request, db: Session) -> UserModel:
    """Extract user from request for SSE"""
    # Force Headers for security (avoid log leaks)
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    if not token:
        # Strict: Do not accept query params due to logging risk
        return None
    
    try:
        payload = verify_token(token)
        user_id = int(payload.get("sub"))
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        return user
    except Exception:
        return None

@router.get("/stream")
async def stream_updates(
    request: Request,
    db: Session = Depends(get_db)
):
    """Server-Sent Events endpoint for real-time updates"""
    current_user = await get_user_from_request(request, db)
    
    if not current_user:
        async def error_generator():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Unauthorized'})}\n\n"
        
        return StreamingResponse(
            error_generator(),
            media_type="text/event-stream",
            status_code=401,
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
    
    return StreamingResponse(
        event_generator(current_user.id, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/trigger/email")
async def trigger_email_update(
    message_id: str,
    action: str,  # 'new', 'read', 'unread', 'deleted'
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually trigger an email update event (for testing)"""
    # This would be called after email actions to notify connected clients
    # For now, it's a placeholder - in production, this would be called
    # automatically after email operations
    return {
        "status": "success",
        "message": f"Email {action} event triggered",
        "message_id": message_id
    }

@router.post("/trigger/meeting")
async def trigger_meeting_update(
    event_id: str,
    action: str,  # 'created', 'updated', 'deleted'
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually trigger a meeting update event (for testing)"""
    return {
        "status": "success",
        "message": f"Meeting {action} event triggered",
        "event_id": event_id
    }
