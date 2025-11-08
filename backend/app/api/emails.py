from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, ServiceToken
from app.core.schemas import (
    EmailDetailResponse, EmailReplyRequest, EmailForwardRequest, 
    EmailMarkReadRequest, EmailThreadResponse, EmailResponse
)
from app.core.google_services import GmailService
from app.api.dashboard import get_google_credentials
from typing import List

router = APIRouter(prefix="/api/emails", tags=["emails"])

@router.get("/{message_id}", response_model=EmailDetailResponse)
async def get_email(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get full email details by message ID"""
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
        
        return EmailDetailResponse(**email_data)
    except Exception as e:
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
    db: Session = Depends(get_db)
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
        
        return EmailThreadResponse(
            thread_id=thread_id,
            messages=[EmailDetailResponse(**msg) for msg in messages]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching thread: {str(e)}"
        )

@router.get("/", response_model=List[EmailResponse])
async def get_all_emails(
    query: str = "",
    max_results: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all emails with optional query filter"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        gmail_service = GmailService(credentials)
        emails_data = gmail_service.get_all_emails(query, max_results)
        
        emails = []
        for i, email_data in enumerate(emails_data):
            emails.append(EmailResponse(
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
        
        return emails
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching emails: {str(e)}"
        )
