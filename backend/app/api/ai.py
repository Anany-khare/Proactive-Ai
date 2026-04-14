import re
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, ChatMessage, Meeting, Email
from app.core.google_services import CalendarService
from app.api.dashboard import get_google_credentials
from app.api.meetings import _sanitize_rfc3339
from app.services.ai_service import (
    generate_chat_response,
    generate_email_reply,
    generate_dashboard_insights,
    detect_meeting_conflicts_sync,
    generate_conflict_resolution,
    generate_email_priority_summary,
    get_user_context,
    _format_context_block,
    generate_llm_response,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str


class GenerateReplyRequest(BaseModel):
    email_body: str
    context: Optional[str] = None


class GenerateReplyResponse(BaseModel):
    reply_text: str


class InsightsResponse(BaseModel):
    insights: str
    conflicts: List[Dict[str, Any]] = []


class ConflictResponse(BaseModel):
    conflicts: List[Dict[str, Any]]
    total: int


class ResolutionResponse(BaseModel):
    suggestion: str


class EmailSummaryResponse(BaseModel):
    summary: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    General-purpose AI chat. Saves messages to DB for persistence.
    """
    # Save user message
    user_msg = ChatMessage(
        user_id=current_user.id,
        role="user",
        content=request.message,
    )
    db.add(user_msg)
    db.commit()

    # Generate AI response
    raw_reply = await generate_chat_response(
        user_message=request.message,
        user_id=current_user.id,
        db=db,
    )

    clean_reply = raw_reply

    # ---------------------------------------------------------------------------------
    # MEETING AUTOMATION INTERCEPT
    # Detect the [SCHEDULE_MEETING] JSON output by parsing the text via Regex
    # ---------------------------------------------------------------------------------
    match = re.search(r'\[SCHEDULE_MEETING\](.*?)\[/SCHEDULE_MEETING\]', raw_reply, re.DOTALL)
    if match:
        json_str = match.group(1).strip()
        try:
            payload = json.loads(json_str)
            
            # Fetch Creds
            credentials = get_google_credentials(current_user, db)
            if not credentials:
                logger.warning("Agent requested meeting schedule but Google Account is not connected")
                clean_reply = raw_reply.replace(match.group(0), "").strip()
                clean_reply += "\n\n*(Note: I tried to schedule this meeting, but your Google Account is not connected to the dashboard.)*"
            else:
                # Dispatch to Google Calendar
                calendar_service = CalendarService(credentials)
                
                start_dt = _sanitize_rfc3339(payload.get('start_datetime', ''))
                end_dt = _sanitize_rfc3339(payload.get('end_datetime', ''))
                title = payload.get('title', 'Meeting Auto-Scheduled via AI')
                location = payload.get('location', '')
                description = payload.get('description', '')

                # -------------------------------------------------------------
                # PROACTIVE SCHEDULING INTERVENTION
                # Check for overlaps directly via SQLAlchemy
                # -------------------------------------------------------------
                was_rescheduled = False
                proactive_note = ""
                try:
                    if start_dt and end_dt:
                        s_obj = datetime.fromisoformat(start_dt.replace('Z', '+00:00'))
                        e_obj = datetime.fromisoformat(end_dt.replace('Z', '+00:00'))
                        duration = e_obj - s_obj
                        original_tz = s_obj.tzinfo
                        
                        while True:
                            conflict = db.query(Meeting).filter(
                                Meeting.user_id == current_user.id,
                                Meeting.start_time < e_obj,
                                Meeting.end_time > s_obj
                            ).order_by(Meeting.end_time).first()
                            
                            if not conflict:
                                break  # Free slot found natively!
                                
                            # Push meeting iteratively
                            if conflict.end_time:
                                # Safe re-attachment of local TZ if SQLite stripped it into naive numbers
                                if conflict.end_time.tzinfo is None:
                                    s_obj = conflict.end_time.replace(tzinfo=original_tz)
                                else:
                                    s_obj = conflict.end_time.astimezone(original_tz)
                                    
                                e_obj = s_obj + duration
                                was_rescheduled = True
                            else:
                                break # Safety escape
                            
                        if was_rescheduled:
                            start_dt = s_obj.isoformat()
                            end_dt = e_obj.isoformat()
                            proactive_note = f"\n\n[Proactive Action Taken: Logistical conflict detected. I autonomously re-routed this meeting to begin immediately after your prior commitments end at {s_obj.strftime('%I:%M %p')} instead]"
                except ValueError:
                    pass

                event = calendar_service.create_event(
                    title=title,
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    location=location,
                    description=description,
                    attendees=[] # Optional AI Attendees enhancement could go here 
                )
                
                if event:
                    # Sync to PostgreSQL/SQLite
                    db_meeting = Meeting(
                        user_id=current_user.id,
                        id=event.get('id'),
                        title=title,
                        start_time=datetime.fromisoformat(start_dt.replace('Z', '+00:00')) if start_dt else None,
                        end_time=datetime.fromisoformat(end_dt.replace('Z', '+00:00')) if end_dt else None,
                        location=location,
                        description=description,
                        attendees=[]
                    )
                    db.add(db_meeting)
                    db.commit()
                
                # Cleanup the strict JSON logic from the bot's user-facing reply
                clean_reply = raw_reply.replace(match.group(0), "").strip() + proactive_note

        except Exception as e:
            logger.error(f"Failed to auto-schedule meeting via LLM agent: {e}")
            clean_reply = raw_reply.replace(match.group(0), "").strip()
            clean_reply += "\n\n*(Note: I encountered an error while trying to automatically schedule the meeting to your Google Calendar. Please check your formatting.)*"

    # Save assistant message
    assistant_msg = ChatMessage(
        user_id=current_user.id,
        role="assistant",
        content=clean_reply,
    )
    db.add(assistant_msg)
    db.commit()

    return ChatResponse(response=clean_reply)


@router.get("/chat/history")
async def get_chat_history(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get recent chat messages for the current user."""
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    # Reverse to get chronological order
    messages.reverse()
    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "timestamp": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ]
    }


@router.delete("/chat/history")
async def clear_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all chat messages for the current user."""
    db.query(ChatMessage).filter(ChatMessage.user_id == current_user.id).delete()
    db.commit()
    return {"status": "cleared"}


@router.post("/generate-reply", response_model=GenerateReplyResponse)
async def generate_reply(
    request: GenerateReplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a professional email reply. Uses the user's context so the LLM
    can reference meetings / todos if relevant. Falls back to a sensible
    default when the LLM is unavailable.
    """
    reply = await generate_email_reply(
        email_body=request.email_body,
        user_id=current_user.id,
        db=db,
    )
    return GenerateReplyResponse(reply_text=reply)


@router.get("/insights", response_model=InsightsResponse)
async def get_dashboard_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a Gemini-powered daily briefing with conflict warnings and
    actionable suggestions based on the user's meetings, emails, and todos.
    """
    insights = await generate_dashboard_insights(current_user.id, db)
    conflicts = detect_meeting_conflicts_sync(current_user.id, db)
    return InsightsResponse(insights=insights, conflicts=conflicts)


@router.get("/conflicts", response_model=ConflictResponse)
async def get_meeting_conflicts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Detect overlapping / conflicting meetings in the next 14 days.
    """
    conflicts = detect_meeting_conflicts_sync(current_user.id, db)
    return ConflictResponse(conflicts=conflicts, total=len(conflicts))


@router.post("/conflicts/resolve", response_model=ResolutionResponse)
async def resolve_conflicts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Ask Gemini for smart rescheduling suggestions for detected conflicts.
    """
    conflicts = detect_meeting_conflicts_sync(current_user.id, db)
    suggestion = await generate_conflict_resolution(conflicts, current_user.id, db)
    return ResolutionResponse(suggestion=suggestion)


@router.get("/email-summary", response_model=EmailSummaryResponse)
async def get_email_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get a Gemini-powered priority summary of unread emails.
    """
    summary = await generate_email_priority_summary(current_user.id, db)
    return EmailSummaryResponse(summary=summary)


@router.post("/auto-reschedule")
async def auto_reschedule(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Full proactive pipeline: detect conflicts, reschedule the lower-priority
    meeting, and notify attendees via email.
    """
    from app.services.proactive_service import auto_resolve_conflicts
    actions = await auto_resolve_conflicts(current_user, db)
    return {"actions": actions, "total": len(actions)}


@router.get("/free-slots")
async def get_free_slots(
    duration: int = 60,
    days: int = 7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Find available time slots in the user's calendar.
    """
    from app.services.proactive_service import find_free_slots
    slots = find_free_slots(current_user.id, db, duration_minutes=duration, days_ahead=days)
    return {"slots": slots, "total": len(slots)}


class SmartReplyRequest(BaseModel):
    email_id: str


@router.post("/smart-reply")
async def smart_reply(
    request: SmartReplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate an intelligent, calendar-aware email reply.
    - For normal emails: generate a professional AI reply
    - For meeting invites: check availability, accept/reschedule accordingly
    """
    # Fetch the email
    email = db.query(Email).filter(
        Email.id == request.email_id,
        Email.user_id == current_user.id,
    ).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    email_text = f"Subject: {email.subject or ''}\nFrom: {email.sender or ''}\n\n{email.body or email.preview or ''}"

    # Detect if meeting invite
    meeting_keywords = ['invite', 'meeting', 'calendar', 'agenda', 'scheduled', 'join', 'rsvp', 'conference']
    text_lower = email_text.lower()
    is_meeting = any(kw in text_lower for kw in meeting_keywords)

    if is_meeting:
        # Check availability for the next 7 days
        from app.services.proactive_service import find_free_slots
        free_slots = find_free_slots(current_user.id, db, duration_minutes=60, days_ahead=7)

        context = get_user_context(current_user.id, db)
        slot_block = ""
        if free_slots:
            slot_lines = [f"  - {s['start']} to {s['end']}" for s in free_slots[:5]]
            slot_block = "\nYour available time slots:\n" + "\n".join(slot_lines)

        prompt = (
            "You are an AI email assistant. The user received a meeting invite email. "
            "Draft a polite, professional reply. If the user is free at the proposed time, accept. "
            "If not, suggest alternative times from the available slots below.\n\n"
            f"=== Email ===\n{email_text}\n=== End Email ===\n\n"
            f"=== User Context ===\n{_format_context_block(context)}\n"
            f"{slot_block}\n=== End Context ===\n\n"
            "Important: Prefix your reply with '[AI Auto-Reply] ' to indicate this is automated.\n"
            "Reply:"
        )
        reply = await generate_llm_response(prompt)
        return {
            "reply_text": reply,
            "is_meeting": True,
            "meeting_detected": True,
            "free_slots": free_slots[:5] if free_slots else [],
        }
    else:
        # Normal email - generate contextual reply
        reply = await generate_email_reply(email_text, current_user.id, db)
        reply = f"[AI Auto-Reply] {reply}"
        return {
            "reply_text": reply,
            "is_meeting": False,
            "meeting_detected": False,
        }
