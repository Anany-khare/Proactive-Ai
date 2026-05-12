"""
Proactive Service — Automatic meeting conflict detection, smart rescheduling,
and email notification system.

Workflow:
  1. detect_conflicts()  — find overlapping meetings in the user's calendar
  2. find_free_slots()   — scan the calendar for open windows
  3. pick_best_slot()    — use Gemini to choose the ideal alternative time
  4. reschedule_meeting() — move the lower-priority meeting via Google Calendar API
  5. notify_attendees()  — send an email to all attendees about the change
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.models import Meeting, Notification, User, ServiceToken
from app.core.google_services import CalendarService, GmailService
from app.core.config import settings
from app.api.dashboard import get_google_credentials
from app.services.ai_service import (
    detect_meeting_conflicts_sync,
    generate_conflict_resolution,
    get_upcoming_meetings,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Free-slot finder
# ---------------------------------------------------------------------------

def find_free_slots(
    user_id: int,
    db: Session,
    duration_minutes: int = 60,
    days_ahead: int = 7,
    work_start_hour: int = 9,
    work_end_hour: int = 21,  # Extended work hours for flexibility
) -> List[Dict]:
    """
    Scan the user's calendar and return available time slots in IST.
    """
    ist = timezone(timedelta(hours=5, minutes=30), name="IST")
    now = datetime.now(ist)
    meetings = get_upcoming_meetings(user_id, db, days=days_ahead)

    # Build a list of busy intervals, forced to IST
    busy: List[Tuple[datetime, datetime]] = []
    for m in meetings:
        try:
            # Most strings will be ISO, we ensure they are treated as UTC then converted to IST
            dt_s = datetime.fromisoformat(m["start"].replace('Z', '+00:00'))
            dt_e = datetime.fromisoformat(m["end"].replace('Z', '+00:00'))
            busy.append((dt_s.astimezone(ist), dt_e.astimezone(ist)))
        except (ValueError, TypeError):
            continue
    busy.sort(key=lambda x: x[0])

    free_slots: List[Dict] = []
    for day_offset in range(days_ahead):
        day_date = (now + timedelta(days=day_offset)).date()
        day_start = datetime.combine(day_date, datetime.min.time()).replace(tzinfo=ist).replace(
            hour=work_start_hour, minute=0, second=0, microsecond=0
        )
        day_end = day_start.replace(hour=work_end_hour)

        # Skip if the entire work day is in the past
        if day_end < now:
            continue
            
        cursor = max(day_start, now)

        # Filter busy intervals for this day (in IST)
        day_busy = [
            (max(s, day_start), min(e, day_end))
            for s, e in busy
            if s < day_end and e > day_start
        ]
        day_busy.sort(key=lambda x: x[0])

        for bs, be in day_busy:
            if (bs - cursor).total_seconds() >= duration_minutes * 60:
                free_slots.append({
                    "start": cursor.isoformat(),
                    "end": bs.isoformat(),
                    "display_start": cursor.strftime("%d %b, %I:%M %p IST"),
                    "display_end": bs.strftime("%I:%M %p IST"),
                    "duration_min": int((bs - cursor).total_seconds() / 60),
                })
            cursor = max(cursor, be)

        # Remaining gap after last meeting
        if (day_end - cursor).total_seconds() >= duration_minutes * 60:
            free_slots.append({
                "start": cursor.isoformat(),
                "end": day_end.isoformat(),
                "display_start": cursor.strftime("%d %b, %I:%M %p IST"),
                "display_end": day_end.strftime("%I:%M %p IST"),
                "duration_min": int((day_end - cursor).total_seconds() / 60),
            })

    return free_slots


# ---------------------------------------------------------------------------
# Smart rescheduling
# ---------------------------------------------------------------------------

def _meeting_priority_score(meeting: Dict) -> int:
    """
    Higher score = higher priority (should NOT be moved).
    Factors: number of attendees, whether it's recurring, title keywords.
    """
    score = 0
    attendees = meeting.get("attendees", "[]")
    if isinstance(attendees, list):
        score += len(attendees) * 10
    elif isinstance(attendees, str):
        score += attendees.count("@") * 10  # rough attendee count

    title = (meeting.get("title") or "").lower()
    # High-priority keywords
    if "board" in title or "investor" in title or "urgent" in title:
        score += 500  # Massive boost for critical meetings
    
    for kw in ["standup", "sprint", "review", "1:1", "one-on-one", "interview", "quarterly"]:
        if kw in title:
            score += 50

    # Low-priority keywords
    for kw in ["marketing", "internal", "sync", "catchup", "coffee", "chat", "newsletter"]:
        if kw in title:
            score -= 100 # Significant penalty for flexible meetings
    return score


def pick_meeting_to_move(conflict: Dict) -> Dict:
    """Given a conflict pair, return the lower-priority meeting to reschedule."""
    a = conflict["meeting_a"]
    b = conflict["meeting_b"]
    if _meeting_priority_score(a) >= _meeting_priority_score(b):
        return b  # move B (lower priority)
    return a  # move A


async def generate_proactive_plan(user: User, meeting_info: Dict, db: Session) -> Dict:
    """
    Evaluate a proposed meeting info (extracted from email) against existing calendar.
    Returns a 'Plan' dict:
    {
        "has_conflict": bool,
        "conflict_with": str or None,
        "decision": "accept" | "reschedule_existing" | "suggest_new_slot",
        "priority_comparison": "higher" | "lower" | "equal",
        "suggested_slot": str ISO or None
    }
    """
    ist = timezone(timedelta(hours=5, minutes=30), name="IST")
    
    # Parse proposed times
    try:
        # Proposed start/end are extracted by LLM, might need padding/checks
        s_str = meeting_info.get("start_time")
        if not s_str: return {"has_conflict": False, "decision": "accept", "note": "No start time found"}
        
        prop_start = datetime.fromisoformat(s_str.replace('Z', '+00:00')).astimezone(ist)
        
        e_str = meeting_info.get("end_time")
        if e_str:
            prop_end = datetime.fromisoformat(e_str.replace('Z', '+00:00')).astimezone(ist)
        else:
            prop_end = prop_start + timedelta(hours=1)
    except (ValueError, TypeError, KeyError):
        return {"has_conflict": False, "decision": "accept", "note": "Invalid time format in proposal"}

    # Find overlapping meetings
    meetings = get_upcoming_meetings(user.id, db, days=2)  # Check next 48 hours for conflicts
    conflicts = []
    for m in meetings:
        try:
            m_s = datetime.fromisoformat(m["start"].replace('Z', '+00:00')).astimezone(ist)
            m_e = datetime.fromisoformat(m["end"].replace('Z', '+00:00')).astimezone(ist)
            if prop_start < m_e and m_s < prop_end:
                conflicts.append(m)
        except:
            continue

    if not conflicts:
        # Check for blocked lunch hour (1 PM to 2 PM)
        # 13 is 1 PM, 14 is 2 PM
        if prop_start.hour == 13 or (prop_start.hour < 13 and prop_end.hour >= 14):
            # Check if it's an urgent 1-on-1
            title_lower = meeting_info.get("title", "").lower()
            notes_lower = meeting_info.get("notes", "").lower()
            is_1on1 = "1-on-1" in title_lower or "1 on 1" in title_lower or "1:1" in title_lower
            is_urgent = "urgent" in title_lower or "urgent" in notes_lower
            
            if is_1on1 and is_urgent:
                 return {
                     "has_conflict": True,
                     "decision": "suggest_new_slot",
                     "message": "This is during your lunch break (1-2 PM), but since it's an urgent 1-on-1, please review and confirm if you want to accept.",
                     "priority_comparison": "lower",
                     "conflict_with": "Lunch Break (1-2 PM)"
                 }
            else:
                 return {
                     "has_conflict": True,
                     "decision": "decline",
                     "message": "Automatically flagging as decline since this falls within your blocked lunch break (1-2 PM).",
                     "priority_comparison": "lower",
                     "conflict_with": "Lunch Break (1-2 PM)"
                 }

        return {
            "has_conflict": False,
            "decision": "accept",
            "message": "Time slot is free. Ready to sync."
        }

    # Handle first conflict found
    conflict = conflicts[0]
    
    # NEW INTEGRATION: Use Langchain Agent to resolve priority and generate reply
    from app.agents.meeting_agent import analyze_meeting_conflict_with_langchain
    
    proposed_title = meeting_info.get("title", "Proposed Meeting")
    existing_title = conflict.get("title", "Existing Meeting")
    proposed_sender = meeting_info.get("sender", "Unknown Sender")
    existing_attendees = conflict.get("attendees", [])
    if isinstance(existing_attendees, str):
        try:
            import json
            existing_attendees = json.loads(existing_attendees)
            existing_attendees = [a.get("email") if isinstance(a, dict) else a for a in existing_attendees]
        except:
            existing_attendees = []

    agent_result = await analyze_meeting_conflict_with_langchain(
        proposed_title, 
        existing_title, 
        proposed_sender, 
        existing_attendees
    )
    
    if agent_result:
        decision = agent_result.get("decision")
        reply_body = agent_result.get("reply_body")
        reason = agent_result.get("reason")
        
        free_slots = find_free_slots(user.id, db, duration_minutes=60, days_ahead=3)
        
        if decision == "reschedule_existing":
            slot = free_slots[0] if free_slots else None
            return {
                "has_conflict": True,
                "conflict_id": conflict["id"],
                "conflict_with": conflict["title"],
                "decision": "reschedule_existing",
                "priority_comparison": "higher",
                "message": f"Conflict with '{conflict['title']}'. Agent decided: {reason}. I'll move '{conflict['title']}' to {slot['display_start'] if slot else 'a later slot'}.",
                "suggested_slot": slot["start"] if slot else None,
                "agent_reply_body": reply_body
            }
        else:
            better_slots = [s for s in free_slots if datetime.fromisoformat(s["start"]) >= prop_end or datetime.fromisoformat(s["end"]) <= prop_start]
            slot = better_slots[0] if better_slots else (free_slots[0] if free_slots else None)
            return {
                "has_conflict": True,
                "conflict_id": conflict["id"],
                "conflict_with": conflict["title"],
                "decision": "suggest_new_slot",
                "priority_comparison": "lower",
                "message": f"Conflict with '{conflict['title']}'. Agent decided: {reason}. Suggested new time: {slot['display_start'] if slot else 'TBD'}.",
                "suggested_slot": slot["start"] if slot else None,
                "agent_reply_body": reply_body
            }
            
    # Fallback to old heuristic if Langchain fails or no key
    existing_priority = _meeting_priority_score(conflict)
    
    # Evaluate proposed meeting priority
    proposed_priority = _meeting_priority_score({
        "title": meeting_info.get("title", ""),
        "attendees": meeting_info.get("attendees", [])
    })

    if proposed_priority > existing_priority:
        # Proposed is more important -> suggestion is to move the old one
        free_slots = find_free_slots(user.id, db, duration_minutes=60, days_ahead=3)
        slot = free_slots[0] if free_slots else None
        return {
            "has_conflict": True,
            "conflict_id": conflict["id"],
            "conflict_with": conflict["title"],
            "decision": "reschedule_existing",
            "priority_comparison": "higher",
            "message": f"Conflict with '{conflict['title']}', but this meeting is higher priority. I'll move '{conflict['title']}' to {slot['display_start'] if slot else 'a later slot'}.",
            "suggested_slot": slot["start"] if slot else None
        }
    else:
        # Proposed is less important -> find a new slot for the proposal
        free_slots = find_free_slots(user.id, db, duration_minutes=60, days_ahead=3)
        # Filter slots that don't overlap with the current conflict
        better_slots = [s for s in free_slots if datetime.fromisoformat(s["start"]) >= prop_end or datetime.fromisoformat(s["end"]) <= prop_start]
        slot = better_slots[0] if better_slots else (free_slots[0] if free_slots else None)
        
        return {
            "has_conflict": True,
            "conflict_id": conflict["id"],
            "conflict_with": conflict["title"],
            "decision": "suggest_new_slot",
            "priority_comparison": "lower",
            "message": f"Conflict with your existing '{conflict['title']}'. Since this is lower priority, I've found a better time for it at {slot['display_start'] if slot else 'TBD'}.",
            "suggested_slot": slot["start"] if slot else None
        }


async def reschedule_meeting(
    user: User,
    meeting_to_move: Dict,
    new_start: str,
    new_end: str,
    db: Session,
) -> Optional[Dict]:
    """
    Move a meeting to a new time via Google Calendar API.
    Returns the updated event dict on success, None on failure.
    """
    credentials = get_google_credentials(user, db)
    if not credentials:
        logger.error("No Google credentials for user %s", user.id)
        return None

    try:
        cal = CalendarService(credentials)
        updated = cal.update_event(
            event_id=meeting_to_move["id"],
            start_datetime=new_start,
            end_datetime=new_end,
            send_updates='all'
        )
        if updated:
            # Update local DB record too
            local = db.query(Meeting).filter(Meeting.id == meeting_to_move["id"]).first()
            if local:
                local.start_time = datetime.fromisoformat(new_start)
                local.end_time = datetime.fromisoformat(new_end)
                db.commit()

            # Create notification
            notif = Notification(
                user_id=user.id,
                type="reschedule",
                message=(
                    f"Meeting '{meeting_to_move.get('title', 'Untitled')}' was "
                    f"automatically rescheduled to {new_start}"
                ),
                related_id=None,
            )
            db.add(notif)
            db.commit()
        return updated
    except Exception as exc:
        logger.error("Failed to reschedule meeting: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Email notification for rescheduling & cancellation
# ---------------------------------------------------------------------------

def send_cancellation_notification(
    user: User,
    meeting_title: str,
    start_time_str: str,
    attendees: List[str],
    db: Session,
) -> bool:
    """
    Send an email to all attendees informing them that a meeting was canceled.
    """
    credentials = get_google_credentials(user, db)
    if not credentials:
        logger.error("No credentials to send cancellation email")
        return False

    emails = [e for e in attendees if e and e != user.email]
    if not emails:
        return True

    subject = f"Meeting Canceled: {meeting_title}"
    body = (
        f"Hi,\n\n"
        f"This is an automated notification from {user.name or user.email}'s AI assistant.\n\n"
        f"The meeting \"{meeting_title}\" originally scheduled for {start_time_str} has been canceled. "
        f"The calendar event has been removed.\n\n"
        f"Apologies for any inconvenience.\n\n"
        f"Best regards,\n"
        f"Proactive AI Assistant"
    )

    try:
        import email as email_mod
        import base64
        gmail = GmailService(credentials)
        msg = email_mod.message.EmailMessage()
        msg["To"] = ", ".join(emails)
        msg["From"] = user.email
        msg["Subject"] = subject
        msg.set_content(body)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        gmail.service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return True
    except Exception as exc:
        logger.error("Failed to send cancellation email: %s", exc)
        return False


def send_reschedule_notification(
    user: User,
    meeting: Dict,
    old_start: str,
    new_start: str,
    new_end: str,
    db: Session,
) -> bool:
    """
    Send an email to all attendees informing them of the schedule change.
    Uses the user's Gmail via Google API.
    """
    credentials = get_google_credentials(user, db)
    if not credentials:
        logger.error("No credentials to send notification email")
        return False

    attendees_raw = meeting.get("attendees", "[]")
    if isinstance(attendees_raw, str):
        import json
        try:
            attendees_list = json.loads(attendees_raw)
        except (json.JSONDecodeError, TypeError):
            attendees_list = []
    elif isinstance(attendees_raw, list):
        attendees_list = attendees_raw
    else:
        attendees_list = []

    # Extract email addresses
    emails = []
    for a in attendees_list:
        if isinstance(a, dict):
            emails.append(a.get("email", ""))
        elif isinstance(a, str) and "@" in a:
            emails.append(a)
    emails = [e for e in emails if e and e != user.email]

    if not emails:
        logger.info("No external attendees to notify for meeting %s", meeting.get("id"))
        return True  # nothing to send is still a success

    title = meeting.get("title", "a meeting")
    subject = f"Schedule Update: {title}"
    body = (
        f"Hi,\n\n"
        f"This is an automated notification from your AI assistant.\n\n"
        f"The meeting \"{title}\" has been rescheduled:\n"
        f"  • Previous time: {old_start}\n"
        f"  • New time:      {new_start} to {new_end}\n\n"
        f"This change was made to resolve a scheduling conflict. "
        f"Please update your calendar accordingly.\n\n"
        f"Best regards,\n"
        f"Proactive AI Assistant"
    )

    try:
        import email as email_mod
        import base64

        gmail = GmailService(credentials)
        msg = email_mod.message.EmailMessage()
        msg["To"] = ", ".join(emails)
        msg["From"] = user.email
        msg["Subject"] = subject
        msg.set_content(body)

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        gmail.service.users().messages().send(
            userId="me", body={"raw": raw}
        ).execute()
        logger.info("Reschedule notification sent to %s", emails)
        return True
    except Exception as exc:
        logger.error("Failed to send reschedule email: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Full auto-reschedule pipeline
# ---------------------------------------------------------------------------

async def auto_resolve_conflicts(user: User, db: Session) -> List[Dict]:
    """
    End-to-end proactive pipeline:
      1. Detect conflicts
      2. For each conflict, pick the lower-priority meeting
      3. Find a free slot that fits
      4. Reschedule via Google Calendar
      5. Notify attendees via email
      6. Return a summary of actions taken

    Returns a list of action dicts:
      [{"conflict": {...}, "moved": {...}, "new_time": "...", "notified": bool}, ...]
    """
    conflicts = detect_meeting_conflicts_sync(user.id, db)
    if not conflicts:
        return []

    actions = []
    for conflict in conflicts:
        meeting_to_move = pick_meeting_to_move(conflict)
        old_start = meeting_to_move.get("start", "")
        old_end = meeting_to_move.get("end", "")

        # Calculate duration of the meeting
        try:
            dur = datetime.fromisoformat(old_end) - datetime.fromisoformat(old_start)
            dur_min = max(int(dur.total_seconds() / 60), 30)
        except (ValueError, TypeError):
            dur_min = 60

        # Find a free slot
        free = find_free_slots(
            user.id, 
            db, 
            duration_minutes=dur_min, 
            days_ahead=7,
            work_start_hour=user.work_start_hour or 9,
            work_end_hour=user.work_end_hour or 18
        )
        if not free:
            actions.append({
                "conflict": conflict,
                "moved": meeting_to_move,
                "status": "no_free_slot",
                "notified": False,
            })
            continue

        # Pick the first available slot
        slot = free[0]
        new_start = slot["start"]
        # Calculate new end based on original duration
        new_end_dt = datetime.fromisoformat(new_start) + timedelta(minutes=dur_min)
        new_end = new_end_dt.isoformat()

        # Reschedule
        result = await reschedule_meeting(user, meeting_to_move, new_start, new_end, db)
        if not result:
            actions.append({
                "conflict": conflict,
                "moved": meeting_to_move,
                "status": "reschedule_failed",
                "notified": False,
            })
            continue

        # Notify attendees
        # Google standard update handles notification
        notified = True 

        actions.append({
            "conflict": conflict,
            "moved": meeting_to_move,
            "new_start": new_start,
            "new_end": new_end,
            "status": "rescheduled",
            "notified": notified,
        })

    return actions
