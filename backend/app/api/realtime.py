from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.models import User as UserModel
from app.core.security import verify_token
# from app.api.dashboard import get_google_credentials # This should be removed if present
from app.core.config import settings
import asyncio
import json
import logging
from typing import AsyncGenerator
from app.core.cache import cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/realtime", tags=["realtime"])

# Initialize Redis (Removed, using global cache)
# redis_client = ...


async def event_generator(user_id: int) -> AsyncGenerator[str, None]:
    """Generate Server-Sent Events using Redis Pub/Sub"""
    try:
        # Send initial connection status
        yield f"data: {json.dumps({'type': 'status', 'status': 'connected', 'message': 'Real-time updates active'})}\n\n"
        
        if not cache.enabled:
             # Redis down fallback -> Degraded Mode
             logger.warning("Redis unavailable for realtime updates. Fallback to heartbeat.")
             yield f"data: {json.dumps({'type': 'status', 'status': 'degraded', 'message': 'Live updates paused (Degraded maintenance mode)'})}\n\n"
             while True:
                await asyncio.sleep(30)
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                
        # Connection active
        pubsub = cache.client.pubsub()
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
        event_generator(current_user.id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User
from app.core.google_services import GmailService, CalendarService
from app.api.dashboard import get_google_credentials
from app.core.security import verify_token
from app.core.models import User as UserModel
import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, Set

router = APIRouter(prefix="/api/realtime", tags=["realtime"])

# Store active connections
active_connections: Dict[int, Set] = {}

async def event_generator(user_id: int, db: Session):
    """Generate Server-Sent Events for real-time updates"""
    # Add connection
    if user_id not in active_connections:
        active_connections[user_id] = set()
    active_connections[user_id].add(id(asyncio.current_task()))
    
    try:
        # Send initial connection message
        yield f"data: {json.dumps({'type': 'connected', 'message': 'Real-time updates enabled'})}\n\n"
        
        last_email_check = datetime.now()
        last_meeting_check = datetime.now()
        
        while True:
            # Check for new emails every 30 seconds
            if (datetime.now() - last_email_check).seconds >= 30:
                try:
                    user = db.query(User).filter(User.id == user_id).first()
                    if not user:
                        break
                    credentials = get_google_credentials(user, db)
                    if credentials:
                        gmail_service = GmailService(credentials)
                        # Get recent unread emails
                        emails = gmail_service.get_unread_emails(max_results=5)
                        
                        if emails:
                            yield f"data: {json.dumps({
                                'type': 'emails',
                                'data': emails,
                                'timestamp': datetime.now().isoformat()
                            })}\n\n"
                    last_email_check = datetime.now()
                except Exception as e:
                    yield f"data: {json.dumps({
                        'type': 'error',
                        'message': f'Error checking emails: {str(e)}'
                    })}\n\n"
            
            # Check for new/updated meetings every 60 seconds
            if (datetime.now() - last_meeting_check).seconds >= 60:
                try:
                    user = db.query(User).filter(User.id == user_id).first()
                    if not user:
                        break
                    credentials = get_google_credentials(user, db)
                    if credentials:
                        calendar_service = CalendarService(credentials)
                        # Get upcoming meetings
                        meetings = calendar_service.get_upcoming_events(max_results=10)
                        
                        if meetings:
                            yield f"data: {json.dumps({
                                'type': 'meetings',
                                'data': meetings,
                                'timestamp': datetime.now().isoformat()
                            })}\n\n"
                    last_meeting_check = datetime.now()
                except Exception as e:
                    yield f"data: {json.dumps({
                        'type': 'error',
                        'message': f'Error checking meetings: {str(e)}'
                    })}\n\n"
            
            # Send heartbeat every 10 seconds
            yield f"data: {json.dumps({
                'type': 'heartbeat',
                'timestamp': datetime.now().isoformat()
            })}\n\n"
            
            await asyncio.sleep(10)
    
    except asyncio.CancelledError:
        # Clean up connection
        if user_id in active_connections:
            active_connections[user_id].discard(id(asyncio.current_task()))
            if not active_connections[user_id]:
                del active_connections[user_id]
        raise
    except Exception as e:
        yield f"data: {json.dumps({
            'type': 'error',
            'message': f'Connection error: {str(e)}'
        })}\n\n"

async def get_user_from_request(request: Request, db: Session) -> UserModel:
    """Extract user from request for SSE (EventSource doesn't support custom headers well)"""
    # Try to get token from query parameter (fallback for EventSource)
    token = request.query_params.get('token')
    if not token:
        # Try to get from Authorization header
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
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
    # Get user from request (EventSource can pass token via query param)
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
