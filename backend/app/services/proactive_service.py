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
    work_end_hour: int = 18,
) -> List[Dict]:
    """
    Scan the user's calendar and return available time slots.

    Returns a list of dicts:
      [{"start": iso_str, "end": iso_str, "duration_min": int}, ...]
    """
    meetings = get_upcoming_meetings(user_id, db, days=days_ahead)
    now = datetime.now(timezone.utc)

    # Build a list of busy intervals
    busy: List[Tuple[datetime, datetime]] = []
    for m in meetings:
        try:
            s = datetime.fromisoformat(m["start"])
            e = datetime.fromisoformat(m["end"])
            busy.append((s, e))
        except (ValueError, TypeError):
            continue
    busy.sort(key=lambda x: x[0])

    # Scan each working day for gaps
    free_slots: List[Dict] = []
    for day_offset in range(days_ahead):
        day = (now + timedelta(days=day_offset)).replace(
            hour=work_start_hour, minute=0, second=0, microsecond=0
        )
        day_end = day.replace(hour=work_end_hour)

        # Skip past days / current moment
        if day_end < now:
            continue
        cursor = max(day, now)

        # Filter busy intervals for this day
        day_busy = [
            (max(s, day), min(e, day_end))
            for s, e in busy
            if s < day_end and e > day
        ]
        day_busy.sort(key=lambda x: x[0])

        for bs, be in day_busy:
            if (bs - cursor).total_seconds() >= duration_minutes * 60:
                free_slots.append({
                    "start": cursor.isoformat(),
                    "end": bs.isoformat(),
                    "duration_min": int((bs - cursor).total_seconds() / 60),
                })
            cursor = max(cursor, be)

        # Remaining gap after last meeting
        if (day_end - cursor).total_seconds() >= duration_minutes * 60:
            free_slots.append({
                "start": cursor.isoformat(),
                "end": day_end.isoformat(),
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
    for kw in ["standup", "sprint", "review", "1:1", "one-on-one", "interview", "board"]:
        if kw in title:
            score += 50
    return score


def pick_meeting_to_move(conflict: Dict) -> Dict:
    """Given a conflict pair, return the lower-priority meeting to reschedule."""
    a = conflict["meeting_a"]
    b = conflict["meeting_b"]
    if _meeting_priority_score(a) >= _meeting_priority_score(b):
        return b  # move B (lower priority)
    return a  # move A


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
# Email notification for rescheduling
# ---------------------------------------------------------------------------

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
        free = find_free_slots(user.id, db, duration_minutes=dur_min, days_ahead=7)
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
        notified = send_reschedule_notification(
            user, meeting_to_move, old_start, new_start, new_end, db
        )

        actions.append({
            "conflict": conflict,
            "moved": meeting_to_move,
            "new_start": new_start,
            "new_end": new_end,
            "status": "rescheduled",
            "notified": notified,
        })

    return actions
