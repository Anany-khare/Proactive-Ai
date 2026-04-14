"""
Agentic Actions API — 1-click execution endpoints.

These endpoints allow the AI (and the frontend) to perform real actions
on behalf of the user, like rescheduling meetings and drafting email replies.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, Email
from app.core.schemas import RescheduleRequest, DraftEmailRequest, ActionResponse
from app.core.google_services import CalendarService, GmailService
from app.core.google_utils import get_google_credentials
from app.services.ai_service import generate_llm_response

router = APIRouter(prefix="/api/actions", tags=["actions"])


@router.post("/reschedule", response_model=ActionResponse)
async def reschedule_meeting(
    request: RescheduleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Reschedule a Google Calendar event to a new time.
    This is the 1-click action triggered by the AI's conflict resolution.
    """
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected",
        )

    try:
        calendar_service = CalendarService(credentials)
        updated_event = calendar_service.update_event(
            event_id=request.event_id,
            start_datetime=request.new_start,
            end_datetime=request.new_end,
        )

        if not updated_event:
            return ActionResponse(
                success=False,
                message="Failed to update the calendar event. The event may have been deleted.",
            )

        return ActionResponse(
            success=True,
            message=f"Meeting '{updated_event.get('title', '')}' rescheduled successfully.",
            data={
                "event_id": request.event_id,
                "new_start": request.new_start,
                "new_end": request.new_end,
                "title": updated_event.get("title", ""),
            },
        )
    except Exception as e:
        return ActionResponse(success=False, message=f"Error rescheduling: {str(e)}")


@router.post("/draft-email", response_model=ActionResponse)
async def draft_email_reply(
    request: DraftEmailRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate an AI-powered email reply draft and save it to Gmail Drafts.
    """
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected",
        )

    try:
        # 1. Fetch original email content
        gmail_service = GmailService(credentials)
        original_email = gmail_service.get_email_by_id(request.email_id)

        if not original_email:
            return ActionResponse(
                success=False,
                message="Could not find the original email.",
            )

        # 2. Generate AI reply
        email_body = original_email.get("body", original_email.get("snippet", ""))
        subject = original_email.get("subject", "")
        from_email = original_email.get("from_email", "")

        tone_instruction = {
            "professional": "Use a professional, polished tone.",
            "casual": "Use a friendly, casual tone.",
            "urgent": "Use a concise, urgent tone that conveys importance.",
        }.get(request.tone, "Use a professional tone.")

        prompt = (
            f"Draft a short, {request.tone} reply to this email.\n"
            f"{tone_instruction}\n"
            f"Output ONLY the reply text — no subject line, no greeting like 'Dear', no signature.\n\n"
            f"From: {from_email}\nSubject: {subject}\n\n{email_body[:2000]}\n\nReply:"
        )

        draft_text = await generate_llm_response(prompt)

        if not draft_text or "unable to process" in draft_text.lower():
            return ActionResponse(
                success=False,
                message="AI could not generate a reply. Please try again.",
            )

        # 3. Create draft in Gmail
        import email as email_lib
        import base64

        message = email_lib.message.EmailMessage()
        message["To"] = from_email
        message["From"] = current_user.email
        message["Subject"] = f"Re: {subject}" if not subject.startswith("Re:") else subject
        # Reference original email for threading
        message["In-Reply-To"] = request.email_id
        message.set_content(draft_text)

        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

        # Use Gmail API to create draft
        from googleapiclient.discovery import build
        from google.oauth2.credentials import Credentials

        if "client_id" not in credentials:
            from app.core.config import settings
            credentials["client_id"] = settings.GOOGLE_CLIENT_ID
            credentials["client_secret"] = settings.GOOGLE_CLIENT_SECRET

        creds = Credentials.from_authorized_user_info(credentials)
        gmail = build("gmail", "v1", credentials=creds)

        draft = gmail.users().drafts().create(
            userId="me",
            body={
                "message": {
                    "raw": raw_message,
                    "threadId": original_email.get("thread_id", ""),
                }
            },
        ).execute()

        return ActionResponse(
            success=True,
            message=f"Draft reply created in Gmail for '{subject}'.",
            data={
                "draft_id": draft.get("id"),
                "draft_preview": draft_text[:200],
                "to": from_email,
                "subject": f"Re: {subject}",
            },
        )
    except Exception as e:
        return ActionResponse(success=False, message=f"Error creating draft: {str(e)}")
