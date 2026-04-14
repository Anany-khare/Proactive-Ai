from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, ServiceToken
from app.core.schemas import (
    EmailDetailResponse, EmailReplyRequest, EmailForwardRequest, 
    EmailMarkReadRequest, EmailThreadResponse, EmailResponse,
    EmailListResponse
)
from app.core.google_services import GmailService
from app.api.dashboard import get_google_credentials
from typing import List, Optional
import base64
from email.utils import parsedate_to_datetime
from app.api.dashboard import trigger_sync_if_needed, get_time_ago

def mark_gmail_read_bg(user_id: int, message_id: str):
    """Background task to mark email as read in Gmail"""
    from app.core.database import SessionLocal
    from app.core.models import User
    
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"User {user_id} not found for background task")
            return

        credentials = get_google_credentials(user, db)
        if credentials:
            service = GmailService(credentials)
            service.mark_email_read(message_id, True)
    except Exception as e:
        print(f"Failed to mark email {message_id} read in Gmail: {e}")
    finally:
        db.close()

router = APIRouter(prefix="/api/emails", tags=["emails"])

@router.get("/{message_id}", response_model=EmailDetailResponse)
async def get_email(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Get full email details by message ID (Cached)"""
    
    # 1. Check DB Cache first
    from app.core.models import Email
    cached_email = db.query(Email).filter(
        Email.id == message_id, 
        Email.user_id == current_user.id
    ).first()

    if cached_email and cached_email.body:
        print(f"Cache HIT for email {message_id}")
        
    # MOVED UP: Check for read status update even if cached
    # This must happen before returning!
    if cached_email and not cached_email.is_read:
        cached_email.is_read = True
        db.commit()
        # Trigger background update to Gmail
        if background_tasks:
             background_tasks.add_task(mark_gmail_read_bg, current_user.id, message_id)
        
        # Invalidate dashboard cache
        from app.core.cache import cache
        try:
             cache.delete(f"dashboard:summary:{current_user.id}")
        except Exception:
             pass

    if cached_email and cached_email.body:
        return EmailDetailResponse(
            id=cached_email.id,
            thread_id=cached_email.thread_id or "",
            from_email=cached_email.sender or "",
            to="me", 
            subject=cached_email.subject or "",
            body=cached_email.body,
            date=cached_email.received_at.isoformat() if cached_email.received_at else "",
            unread=False, # Now it's read
            snippet=cached_email.preview or ""
        )
    
    # Was redundant code block here - removed as it is now above.

    # 2. Fetch from Google (Cache Miss)
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        gmail_service = GmailService(credentials)
        email_data = gmail_service.get_email_by_id(message_id)
        
        if not email_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Email not found"
            )
        
        # 3. Save to DB Cache
        if cached_email:
            cached_email.body = email_data.get('body', '')
            # Update other fields just in case
            cached_email.subject = email_data.get('subject')
            cached_email.sender = email_data.get('from_email')
            cached_email.preview = email_data.get('snippet')
            db.commit()
            print(f"Cache CACHED body for email {message_id}")
            
            # If we just fetched it, we can also mark it as read if needed? 
            # Usually Gmail 'get' doesn't auto-mark read unless configured.
            # Let's ensure it is marked read in DB since we are viewing it.
            if not cached_email.is_read:
                cached_email.is_read = True
                db.commit()
                # Trigger background sync to Gmail
                if background_tasks:
                     background_tasks.add_task(mark_gmail_read_bg, current_user.id, message_id)

            # Invalidate dashboard cache
            try:
                 from app.core.cache import cache
                 cache.delete(f"dashboard:summary:{current_user.id}")
            except Exception:
                 pass
        else:
            # Create new Email object if not found in DB
            from app.core.models import Email
            new_email = Email(
                id=email_data['id'],
                user_id=current_user.id,
                thread_id=email_data.get('thread_id'),
                sender=email_data.get('from_email'),
                subject=email_data.get('subject'),
                preview=email_data.get('snippet'),
                body=email_data.get('body', ''),
                received_at=parsedate_to_datetime(email_data.get('date')) if email_data.get('date') else None,
                is_read=True, # We are viewing it, so mark as read immediately
                priority='medium' # Default
            )
            db.add(new_email)
            db.commit()
            
            # Since we just created it as read, we should also ensure Gmail is updated
            if background_tasks:
                 background_tasks.add_task(mark_gmail_read_bg, current_user.id, message_id)

            # Invalidate dashboard cache
            try:
                 from app.core.cache import cache
                 cache.delete(f"dashboard:summary:{current_user.id}")
            except Exception:
                 pass

        return EmailDetailResponse(**email_data)
    except Exception as e:
        print(f"Error fetching email {message_id}: {e}") # Debug print
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching email: {str(e)}"
        )

@router.post("/{message_id}/reply")
async def reply_to_email(
    message_id: str,
    request: EmailReplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reply to an email"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        gmail_service = GmailService(credentials)
        reply_id = gmail_service.reply_to_email(
            message_id, 
            request.reply_text, 
            current_user.email
        )
        
        if not reply_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send reply"
            )
        
        return {"status": "success", "message_id": reply_id}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error sending reply: {str(e)}"
        )

@router.post("/{message_id}/forward")
async def forward_email(
    message_id: str,
    request: EmailForwardRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Forward an email"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        gmail_service = GmailService(credentials)
        forward_id = gmail_service.forward_email(
            message_id,
            request.to_emails,
            request.forward_text,
            current_user.email
        )
        
        if not forward_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to forward email"
            )
        
        return {"status": "success", "message_id": forward_id}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error forwarding email: {str(e)}"
        )

@router.delete("/{message_id}")
async def delete_email(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an email"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        gmail_service = GmailService(credentials)
        success = gmail_service.delete_email(message_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete email"
            )
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting email: {str(e)}"
        )

@router.patch("/{message_id}/read")
async def mark_email_read(
    message_id: str,
    request: EmailMarkReadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark email as read or unread"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        gmail_service = GmailService(credentials)
        success = gmail_service.mark_email_read(message_id, request.read)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update email status"
            )
        
        return {"status": "success", "read": request.read}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating email status: {str(e)}"
        )

@router.get("/thread/{thread_id}", response_model=EmailThreadResponse)
async def get_email_thread(
    thread_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Get all emails in a thread"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        gmail_service = GmailService(credentials)
        messages = gmail_service.get_email_thread(thread_id)
        
        if not messages:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Thread not found"
            )
        
        # Mark all messages in thread as read in local DB and sync to Gmail
        from app.core.models import Email
        from app.core.cache import cache
        
        updated_read_status = False
        
        try:
            for msg in messages:
                # 1. Update/Create local DB record
                db_email = db.query(Email).filter(Email.id == msg['id']).first()
                if db_email:
                    if not db_email.is_read:
                        db_email.is_read = True
                        updated_read_status = True
                        if background_tasks: # Trigger background sync for each unread
                             background_tasks.add_task(mark_gmail_read_bg, current_user.id, msg['id'])
                else:
                    # Create if missing (ensure consistency)
                    new_email = Email(
                        id=msg['id'],
                        user_id=current_user.id,
                        thread_id=thread_id,
                        sender=msg.get('from_email'),
                        subject=msg.get('subject'),
                        preview=msg.get('snippet'),
                        body=msg.get('body', ''),
                        received_at=parsedate_to_datetime(msg.get('date')) if msg.get('date') else None,
                        is_read=True, # Mark read
                        priority='medium'
                    )
                    db.add(new_email)
                    updated_read_status = True
                    if background_tasks:
                         background_tasks.add_task(mark_gmail_read_bg, current_user.id, msg['id'])
            
            db.commit()
            if updated_read_status:
                 # Invalidate dashboard cache
                 try:
                      cache.delete(f"dashboard:summary:{current_user.id}")
                 except Exception:
                      pass
        except Exception as e:
            print(f"Error updating thread read status: {e}")
            # Don't fail the request, just log
        
        return EmailThreadResponse(
            thread_id=thread_id,
            messages=[EmailDetailResponse(**msg) for msg in messages]
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching thread {thread_id}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching thread: {str(e)}"
        )

@router.get("/", response_model=EmailListResponse)
async def get_all_emails(
    query: str = "",
    max_results: int = 20,
    page_token: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Get all emails with optional query filter and pagination"""
    
    # OPTIMIZATION: If no query, serve from DB for instant load
    if not query:
        # Trigger background sync if needed (non-blocking mainly)
        # Force check if we are on the first page
        trigger_sync_if_needed(current_user, db, background_tasks, force_check=(not page_token))
        
        # Decode page_token (cursor) if present
        offset = 0
        if page_token:
            try:
                # Simple offset-based cursor for DB
                offset = int(base64.urlsafe_b64decode(page_token.encode()).decode())
            except Exception:
                offset = 0
        
        # Fetch from DB, deferring body for performance
        from sqlalchemy.orm import defer
        from app.core.models import Email
        
        emails_query = db.query(Email).filter(
            Email.user_id == current_user.id
        ).order_by(Email.received_at.desc())
        
        # Get total count (optional, skipping for speed)
        
        # Apply limit/offset
        db_emails = emails_query.offset(offset).limit(max_results).options(defer(Email.body)).all()
        
        # Check if we have more
        has_more = len(db_emails) == max_results
        next_page_token = None
        if has_more:
            next_offset = offset + max_results
            next_page_token = base64.urlsafe_b64encode(str(next_offset).encode()).decode()
            
        emails_list = []
        for e in db_emails:
            emails_list.append(EmailResponse(
                id=e.id,
                from_email=e.sender or "Unknown",
                subject=e.subject or "(No Subject)",
                preview=e.preview or "",
                priority=e.priority or "medium",
                unread=False if e.is_read else True, # Explicit logic
                timestamp=get_time_ago(e.received_at) if e.received_at else "",
                time=get_time_ago(e.received_at) if e.received_at else "",
                thread_id=e.thread_id
            ))
            
        return EmailListResponse(items=emails_list, next_page_token=next_page_token)

    # Fallback to Google API for search queries
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        gmail_service = GmailService(credentials)
        result = gmail_service.get_all_emails(query, max_results, page_token)
        emails_data = result.get('items', [])
        next_page_token = result.get('next_page_token')
        
        emails_list = []
        for i, email_data in enumerate(emails_data):
            emails_list.append(EmailResponse(
                id=email_data['id'],
                from_email=email_data['from'],
                subject=email_data['subject'],
                preview=email_data['preview'],
                priority='medium',  # Default priority
                unread=email_data['unread'],
                timestamp=email_data['time'],
                time=email_data['time'],
                thread_id=email_data.get('thread_id')
            ))
        
        return EmailListResponse(items=emails_list, next_page_token=next_page_token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching emails: {str(e)}"
        )
