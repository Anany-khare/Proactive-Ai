import re
import json
import logging
from datetime import datetime, timedelta, timezone
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
    extract_meeting_info,
)
from app.services.proactive_service import (
    find_free_slots,
    generate_proactive_plan,
    reschedule_meeting,
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


class ExtractMeetingRequest(BaseModel):
    text: str


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


class LogActionRequest(BaseModel):
    id: str  # message_id or thread_id
    summary: str
    action_type: str = "proactive_action"


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

    # Fetch last 10 messages for context
    history_objs = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id
    ).order_by(ChatMessage.created_at.desc()).limit(10).all()

    # Reverse to get chronological order for the prompt
    history_objs.reverse()
    history = [{"role": h.role, "content": h.content} for h in history_objs]

    # Generate AI response with history context
    raw_reply = await generate_chat_response(
        user_message=request.message,
        user_id=current_user.id,
        db=db,
        history=history,
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
                attendees = payload.get('attendees', [])
                create_meet_link = payload.get('create_meet_link', False)

                # -------------------------------------------------------------
                # PROACTIVE SCHEDULING INTERVENTION
                # Check for overlaps directly via SQLAlchemy
                # -------------------------------------------------------------
                was_rescheduled = False
                proactive_note = ""
                try:
                    if start_dt and end_dt:
                        # Clean Z from ISO if present
                        s_iso = start_dt.replace('Z', '+00:00')
                        e_iso = end_dt.replace('Z', '+00:00')
                        s_obj = datetime.fromisoformat(s_iso)
                        e_obj = datetime.fromisoformat(e_iso)
                        duration = e_obj - s_obj
                        original_tz = s_obj.tzinfo
                        
                        # Get user's working hours
                        w_start = current_user.work_start_hour or 9
                        w_end = current_user.work_end_hour or 18

                        from app.services.ai_service import _is_all_day_event

                        # Iteratively find a gap within working hours
                        days_searched = 0
                        while days_searched < 14:  # Safety limit: look up to 14 days ahead
                            # 1. Check if the current window is within working hours
                            # Note: we compare strictly the hour of the local/offset time
                            if s_obj.hour < w_start or s_obj.hour >= w_end or e_obj.hour > w_end or (e_obj.hour == w_end and e_obj.minute > 0):
                                # Push to start of next working day
                                s_obj = (s_obj + timedelta(days=1)).replace(hour=w_start, minute=0, second=0, microsecond=0)
                                e_obj = s_obj + duration
                                was_rescheduled = True
                                continue

                            # 2. Check for conflicts with existing REAL meetings (exclude all-day festivals)
                            conflict = db.query(Meeting).filter(
                                Meeting.user_id == current_user.id,
                                Meeting.start_time < e_obj,
                                Meeting.end_time > s_obj
                            ).order_by(Meeting.start_time).all()
                            
                            # Filter out holidays/festivals/all-day events from being considered "conflicts"
                            real_conflicts = [c for c in conflict if not _is_all_day_event(c.start_time, c.end_time, c.title)]

                            if not real_conflicts:
                                break  # We found a valid slot!
                            
                            # 3. If there is a real conflict, push past it
                            latest_end = max([c.end_time for c in real_conflicts])
                            if latest_end.tzinfo is None:
                                s_obj = latest_end.replace(tzinfo=original_tz)
                            else:
                                s_obj = latest_end.astimezone(original_tz)
                                
                            e_obj = s_obj + duration
                            was_rescheduled = True
                            
                            # If pushing it took us to a new day or late hour, the loop will catch it in step 1
                            days_searched += 1

                        if was_rescheduled:
                            start_dt = s_obj.isoformat()
                            end_dt = e_obj.isoformat()
                            proactive_note = f"\n\n[Proactive Action Taken: Logistical conflict detected. I autonomously re-routed this meeting to a free slot within your working hours at {s_obj.strftime('%I:%M %p')} on {s_obj.strftime('%b %d')}]"
                except Exception as loop_err:
                    logger.error(f"Error in proactive reschedule loop: {loop_err}")

                event = calendar_service.create_event(
                    title=title,
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    location=location,
                    description=description,
                    attendees=attendees,
                    create_meet_link=create_meet_link
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
    slots = find_free_slots(
        current_user.id, 
        db, 
        duration_minutes=duration, 
        days_ahead=days,
        work_start_hour=current_user.work_start_hour or 9,
        work_end_hour=current_user.work_end_hour or 18
    )
    return {"slots": slots, "total": len(slots)}


class SmartReplyRequest(BaseModel):
    email_id: str


@router.post("/log-action")
async def log_proactive_action(
    request: LogActionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Log a summary of a proactive action (like syncing a meeting) to notifications.
    """
    try:
        notification = Notification(
            user_id=current_user.id,
            type=request.action_type,
            message=request.summary,
            related_id=None
        )
        db.add(notification)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to log proactive action: {e}")
        raise HTTPException(status_code=500, detail="Failed to log action")


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

    # Stability: Truncate body if extremely long to avoid LLM timeouts/crashes
    body_text = email.body or email.preview or ""
    if len(body_text) > 8000:
        body_text = body_text[:8000] + "... [truncated]"

    # 1. Check if we already have a background AI insight cached
    if email.ai_insight:
        logger.info(f"Using cached AI insight for email {request.email_id}")
        return {
            "is_meeting": email.ai_insight.get("meeting_info", {}).get("is_meeting", False),
            "meeting_info": email.ai_insight.get("meeting_info"),
            "proactive_plan": email.ai_insight.get("proactive_plan"),
            "reply_text": "[Native RSVP available in Gmail]", # User prefers Gmail UI
            "gmail_link": f"https://mail.google.com/mail/u/0/#all/{email.id}"
        }

    # Fallback to live extraction if insight is missing (e.g. for old emails)
    email_text = f"Subject: {email.subject or ''}\nFrom: {email.sender or ''}\n\n{body_text}"

    # Detect if meeting invite
    meeting_keywords = ['invite', 'meeting', 'calendar', 'agenda', 'scheduled', 'join', 'rsvp', 'conference']
    text_lower = email_text.lower()
    is_meeting = any(kw in text_lower for kw in meeting_keywords)

    if is_meeting:
        # Extract structured details using IST as reference
        ist = timezone(timedelta(hours=5, minutes=30))
        now_str = datetime.now(ist).strftime("%Y-%m-%d %H:%M:%S")
        extracted_info = await extract_meeting_info(email_text, now_str)

        # Update priority logic or planning on the fly
        from app.services.proactive_service import generate_proactive_plan
        plan = await generate_proactive_plan(current_user.id, extracted_info, db)

        # Save to cache for future use
        email.ai_insight = {
            "meeting_info": extracted_info,
            "proactive_plan": plan
        }
        db.commit()

        return {
            "is_meeting": True,
            "meeting_info": extracted_info,
            "proactive_plan": plan,
            "reply_text": "[Native RSVP available in Gmail]",
            "gmail_link": f"https://mail.google.com/mail/u/0/#all/{email.id}"
        }

    # For non-meeting emails, just return a basic reply if needed
    context = get_user_context(current_user.id, db)
    prompt = (
        "Draft a short, professional response to this email: "
        f"{email_text}\n"
        "User context: " + str(context)
    )
    reply = await generate_llm_response(prompt)
    return {
        "is_meeting": False,
        "reply_text": reply,
        "gmail_link": f"https://mail.google.com/mail/u/0/#all/{email.id}"
    }



class ProactiveExecuteRequest(BaseModel):
    email_id: str
    meeting_info: Dict[str, Any]
    plan: Dict[str, Any]


@router.post("/execute-proactive-sync")
async def execute_proactive_sync(
    request: ProactiveExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Execute the proactive plan:
    - If decision is 'accept': Just create the meeting.
    - If decision is 'reschedule_existing': Move conflict, then create meeting.
    - If decision is 'suggest_new_slot': Create meeting at the new slot.
    """
    plan = request.plan
    info = request.meeting_info
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(status_code=400, detail="Google account not connected")

    cal = CalendarService(credentials)
    summary = []

    # 1. Handle Rescheduling of Existing Meeting
    if plan.get("decision") == "reschedule_existing" and plan.get("conflict_id"):
        from app.services.proactive_service import pick_meeting_to_move, send_reschedule_notification
        conflict_id = plan["conflict_id"]
        new_slot = plan.get("suggested_slot")
        
        if new_slot:
            # Get existing meeting details
            meeting_to_move = db.query(Meeting).filter(Meeting.id == conflict_id).first()
            if meeting_to_move:
                old_time = meeting_to_move.start_time.strftime("%I:%M %p")
                # Perform rescheduling
                # Calculate end time based on original duration
                dur = meeting_to_move.end_time - meeting_to_move.start_time
                new_start_dt = datetime.fromisoformat(new_slot.replace('Z', '+00:00'))
                new_end_dt = new_start_dt + dur
                
                res = await reschedule_meeting(current_user, {"id": conflict_id, "title": meeting_to_move.title}, new_start_dt.isoformat(), new_end_dt.isoformat(), db)
                if res:
                    summary.append(f"Moved '{meeting_to_move.title}' to {new_start_dt.strftime('%I:%M %p')}")

    # 2. Determine time for the NEW meeting
    final_start = info["start_time"]
    final_end = info.get("end_time") or (datetime.fromisoformat(final_start.replace('Z', '+00:00')) + timedelta(hours=1)).isoformat()

    if plan.get("decision") == "suggest_new_slot" and plan.get("suggested_slot"):
        final_start = plan["suggested_slot"]
        final_end = (datetime.fromisoformat(final_start.replace('Z', '+00:00')) + timedelta(hours=1)).isoformat()
        summary.append(f"Scheduled at better slot: {datetime.fromisoformat(final_start.replace('Z', '+00:00')).strftime('%I:%M %p')}")

    # 3. Create the event
    event = cal.create_event(
        title=info.get("title", "Email Meeting"),
        start_datetime=final_start,
        end_datetime=final_end,
        location=info.get("location", ""),
        description=info.get("notes", ""),
        attendees=[], # Manual sync usually starts with reply to organizer
        create_meet_link=True
    )

    if event:
        # Sync to DB
        db_meeting = Meeting(
            user_id=current_user.id,
            id=event.get('id'),
            title=event.get('title'),
            start_time=datetime.fromisoformat(final_start.replace('Z', '+00:00')),
            end_time=datetime.fromisoformat(final_end.replace('Z', '+00:00')),
            location=event.get('location'),
            description=event.get('description'),
            attendees=[]
        )
        db.add(db_meeting)
        db.commit()
        summary.append(f"Meeting '{event.get('title')}' added to calendar.")

    return {
        "success": True,
        "summary": " | ".join(summary),
        "event_id": event.get('id') if event else None
    }
