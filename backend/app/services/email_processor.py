"""
Email Processor — Phase 3: Proactive Email-to-Meeting Intelligence.

Runs after every email sync. For each unprocessed email:
1. Uses LLM to detect if it contains a meeting request.
2. If yes, extracts meeting details and creates the event in Google Calendar.
3. If sender is on leave, sends an auto-reply with the return date.
4. For 1-on-1 meetings with a time conflict on the same day, silently
   moves the new meeting to the next free slot within working hours.
5. For URGENT meeting requests, creates a dashboard notification asking
   the user to approve/decline rescheduling of an existing meeting.
"""

import json
import logging
import re
import email as email_mod
import base64
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.models import Email, Meeting, Notification, User
from app.core.google_utils import get_google_credentials
from app.core.google_services import CalendarService, GmailService
from app.services.ai_service import generate_llm_response, extract_meeting_info
from app.services.proactive_service import generate_proactive_plan

logger = logging.getLogger(__name__)

# ─── Meeting detection prompt ───────────────────────────────────────────────

DETECT_PROMPT = """You are an email parser. Analyze the email below and determine if it contains a meeting request.

If it IS a meeting request, output EXACTLY this JSON (no other text):
{{
  "is_meeting": true,
  "title": "Meeting title",
  "proposed_datetime": "YYYY-MM-DDTHH:MM:00",
  "duration_minutes": 60,
  "is_urgent": false,
  "attendees": ["email@example.com"],
  "description": "Short context"
}}

If it is NOT a meeting request, output EXACTLY:
{{"is_meeting": false}}

Email:
Subject: {subject}
From: {sender}
Body:
{body}
"""


def _extract_meet_link_from_text(text: str) -> Optional[str]:
    """Search for video conferencing links in email body or location."""
    patterns = [
        r'https?://meet\.google\.com/[a-z0-9\-]+',
        r'https?://zoom\.us/j/\S+',
        r'https?://teams\.microsoft\.com/l/meetup-join/\S+',
        r'https?://[a-z]+\.zoom\.us/j/\S+',
    ]
    for pattern in patterns:
        match = re.search(pattern, text or '', re.IGNORECASE)
        if match:
            return match.group(0).rstrip('.')
    return None


async def _detect_meeting(email_obj: Email) -> Optional[dict]:
    """Ask LLM whether this email is a meeting request. Returns parsed dict or None."""
    body_snippet = (email_obj.body or email_obj.preview or '')[:1500]
    prompt = DETECT_PROMPT.format(
        subject=email_obj.subject or '',
        sender=email_obj.sender or '',
        body=body_snippet,
    )
    try:
        raw = await generate_llm_response(prompt)
        # Extract the first { ... } block from the response
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            return data if data.get('is_meeting') else None
    except Exception as exc:
        logger.debug("Meeting detection failed for email %s: %s", email_obj.id, exc)
    return None


def _find_free_slot_same_day(
    user: User,
    date: datetime,
    duration_minutes: int,
    db: Session,
) -> Optional[tuple]:
    """
    Find the next free window on `date` within the user's working hours.
    Returns (start_dt, end_dt) or None if no slot exists.
    """
    work_start = date.replace(
        hour=user.work_start_hour or 9,
        minute=0, second=0, microsecond=0,
    )
    work_end = date.replace(
        hour=user.work_end_hour or 18,
        minute=0, second=0, microsecond=0,
    )

    # Get all meetings on that day
    day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    meetings = (
        db.query(Meeting)
        .filter(
            Meeting.user_id == user.id,
            Meeting.start_time >= day_start,
            Meeting.start_time < day_end,
        )
        .order_by(Meeting.start_time)
        .all()
    )

    cursor = max(work_start, datetime.now(timezone.utc).replace(tzinfo=None))
    for m in meetings:
        m_start = m.start_time.replace(tzinfo=None) if m.start_time else cursor
        m_end = m.end_time.replace(tzinfo=None) if m.end_time else m_start + timedelta(hours=1)
        gap = (m_start - cursor).total_seconds() / 60
        if gap >= duration_minutes:
            return cursor, cursor + timedelta(minutes=duration_minutes)
        cursor = max(cursor, m_end)

    # After last meeting
    remaining = (work_end - cursor).total_seconds() / 60
    if remaining >= duration_minutes:
        return cursor, cursor + timedelta(minutes=duration_minutes)
    return None


async def _send_leave_autoreply(user: User, email_obj: Email, db: Session):
    """Send an auto-reply informing the sender the user is on leave."""
    # Suppress for high priority meetings (Board meetings etc)
    if email_obj.priority == 'high':
        logger.info("Suppressing auto-reply for high-priority email %s", email_obj.id)
        return

    credentials = get_google_credentials(user, db)
    if not credentials:
        return
    try:
        leave_info = "I am currently on leave."
        if user.leave_start_date and user.leave_end_date:
            leave_info = f"I am out of the office from {user.leave_start_date} to {user.leave_end_date}."
        elif user.leave_return_date:
            leave_info = f"I am on leave and will return on {user.leave_return_date}."

        reply_body = (
            f"Hi,\n\n"
            f"Thank you for your email. {leave_info} "
            f"I will respond to your message as soon as possible after my return.\n\n"
            f"This is an automated out-of-office (OOO) reply.\n\n"
            f"Best regards,\n{user.name or user.email}"
        )
        gmail = GmailService(credentials)
        msg = email_mod.message.EmailMessage()
        msg["To"] = email_obj.sender
        msg["From"] = user.email
        msg["Subject"] = f"Re: {email_obj.subject or '(no subject)'}"
        msg.set_content(reply_body)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        gmail.service.users().messages().send(
            userId="me", body={"raw": raw}
        ).execute()
        logger.info("Leave auto-reply sent to %s", email_obj.sender)
    except Exception as exc:
        logger.warning("Failed to send leave auto-reply: %s", exc)


async def process_new_emails_for_meetings(user_id: int, db: Session):
    """
    Main entry point called from background_tasks after each email sync.
    Scans unprocessed emails and handles:
    - Leave auto-replies
    - Meeting auto-creation from email requests
    - 1-on-1 silent reschedule
    - Urgent meeting notifications
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return

    # Get emails not yet processed for meetings (last 48 hours, unread focus)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    unprocessed = (
        db.query(Email)
        .filter(
            Email.user_id == user_id,
            Email.meeting_processed == False,  # noqa: E712
            Email.received_at >= cutoff,
        )
        .order_by(Email.received_at.desc())
        .limit(20)
        .all()
    )

    if not unprocessed:
        return

    credentials = get_google_credentials(user, db)

    for email_obj in unprocessed:
        try:
            # ── Mark processed early to avoid re-processing on error ──────
            email_obj.meeting_processed = True
            
            # ── 1. BACKGROUND AI INSIGHT GENERATION ──────────────────────
            # Generate the proactive plan and meeting info as soon as email is saved
            try:
                # Calculate Gmail URL
                thread_id = email_obj.thread_id or email_obj.id
                email_obj.gmail_url = f"https://mail.google.com/mail/u/0/#inbox/{thread_id}"

                # Ensure we have the full body for AI analysis
                if not email_obj.body and credentials:
                    gmail = GmailService(credentials)
                    full_email = gmail.get_email_by_id(email_obj.id)
                    if full_email and full_email.get("body"):
                        email_obj.body = full_email["body"]
                
                if email_obj.body:
                    ist = timezone(timedelta(hours=5, minutes=30))
                    now_str = datetime.now(ist).strftime("%Y-%m-%d %H:%M:%S")
                    email_text = f"Subject: {email_obj.subject}\nFrom: {email_obj.sender}\n\n{email_obj.body}"
                    
                    # Extract structured info using existing ai_service utility
                    info = await extract_meeting_info(email_text, now_str)
                    if info and info.get("is_meeting"):
                        # Generate the proactive resolution plan
                        plan = await generate_proactive_plan(user.id, info, db)
                        # Persist the insight
                        email_obj.ai_insight = {
                            "meeting_info": info,
                            "proactive_plan": plan
                        }
                        logger.info("Generated and saved AI insight for email %s", email_obj.id)
            except Exception as e:
                logger.error("Failed to generate proactive insight for email %s: %s", email_obj.id, e)

            db.commit()
            
            # ── 2. OLD LOGIC REPLACEMENT (Handled by AI Insight now, but keeping some logic for backward compatibility if needed) ──
            # Note: We still use the detected info for the legacy notification path
            meeting_data = email_obj.ai_insight.get("meeting_info") if email_obj.ai_insight else await _detect_meeting(email_obj)
            if not meeting_data:
                continue

            title = meeting_data.get('title', f"Meeting with {email_obj.sender}")
            duration_min = int(meeting_data.get('duration_minutes') or 60)
            is_urgent = bool(meeting_data.get('is_urgent'))
            attendees = meeting_data.get('attendees') or []
            description = meeting_data.get('description', f"Scheduled from email: {email_obj.subject}")
            meet_link = _extract_meet_link_from_text(
                (email_obj.body or '') + ' ' + (email_obj.preview or '')
            )

            # Parse proposed time
            raw_dt = meeting_data.get('proposed_datetime', '')
            try:
                proposed_start = datetime.fromisoformat(raw_dt)
                # If naive, assume same timezone as server
                if proposed_start.tzinfo is None:
                    proposed_start = proposed_start.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                # No valid date found — skip calendar creation, just notify
                if not user.on_leave:
                    notif = Notification(
                        user_id=user_id,
                        type='meeting_request',
                        message=(
                            f"📅 Meeting request detected from {email_obj.sender}: "
                            f"\"{email_obj.subject}\" — no date found. Check email."
                        ),
                        read=False,
                    )
                    db.add(notif)
                    db.commit()
                continue

            proposed_end = proposed_start + timedelta(minutes=duration_min)

            # ── 3. Check conflicts ────────────────────────────────────────
            conflict = (
                db.query(Meeting)
                .filter(
                    Meeting.user_id == user_id,
                    Meeting.start_time < proposed_end,
                    Meeting.end_time > proposed_start,
                )
                .first()
            )

            is_one_on_one = len(attendees) <= 1

            final_start = proposed_start
            final_end = proposed_end
            was_rescheduled = False

            if conflict:
                if is_urgent:
                    # ── URGENT: Ask user for approval ──────────────────────
                    notif = Notification(
                        user_id=user_id,
                        type='urgent_meeting_request',
                        message=(
                            f"🚨 URGENT meeting request from {email_obj.sender}: "
                            f"\"{title}\" wants {proposed_start.strftime('%b %d at %I:%M %p')}. "
                            f"This conflicts with \"{conflict.title}\". "
                            f"Approve reschedule in Meetings."
                        ),
                        read=False,
                    )
                    db.add(notif)
                    db.commit()
                    logger.info("Urgent meeting notification created for user %s", user_id)
                    continue  # Wait for user approval

                elif is_one_on_one:
                    # ── 1-on-1: Silently find next free slot ───────────────
                    slot = _find_free_slot_same_day(user, proposed_start, duration_min, db)
                    if slot:
                        final_start, final_end = slot
                        # Make timezone-aware
                        if final_start.tzinfo is None:
                            final_start = final_start.replace(tzinfo=timezone.utc)
                            final_end = final_end.replace(tzinfo=timezone.utc)
                        was_rescheduled = True
                        logger.info(
                            "1-on-1 meeting silently rescheduled from %s to %s",
                            proposed_start, final_start,
                        )
                    else:
                        # No slot today — notify user
                        notif = Notification(
                            user_id=user_id,
                            type='meeting_request',
                            message=(
                                f"📅 Meeting request from {email_obj.sender}: \"{title}\" "
                                f"on {proposed_start.strftime('%b %d')} — no free slot found."
                            ),
                            read=False,
                        )
                        db.add(notif)
                        db.commit()
                        continue
                else:
                    # Multi-person conflict — notify user to decide
                    notif = Notification(
                        user_id=user_id,
                        type='meeting_request',
                        message=(
                            f"📅 Meeting request from {email_obj.sender}: \"{title}\" "
                            f"conflicts with \"{conflict.title}\". Review in Meetings."
                        ),
                        read=False,
                    )
                    db.add(notif)
                    db.commit()
                    continue

            # ── 4. Create the calendar event ──────────────────────────────
            if not credentials:
                notif = Notification(
                    user_id=user_id,
                    type='meeting_request',
                    message=(
                        f"📅 Meeting request from {email_obj.sender}: \"{title}\" — "
                        f"Google Account not connected to auto-schedule."
                    ),
                    read=False,
                )
                db.add(notif)
                db.commit()
                continue

            calendar_service = CalendarService(credentials)
            event = calendar_service.create_event(
                title=title,
                start_datetime=final_start.isoformat(),
                end_datetime=final_end.isoformat(),
                location=meet_link or '',
                description=description,
                attendees=attendees,
            )

            if event:
                # Save to DB
                db_meeting = Meeting(
                    id=event.get('id'),
                    user_id=user_id,
                    title=title,
                    start_time=final_start,
                    end_time=final_end,
                    location=meet_link or '',
                    description=description,
                    attendees=json.dumps(attendees),
                    meet_link=meet_link or event.get('meet_link'),
                    source_email_id=email_obj.id,
                )
                db.add(db_meeting)

                reschedule_note = (
                    f" (auto-rescheduled to {final_start.strftime('%I:%M %p')} — conflict avoided)"
                    if was_rescheduled else ""
                )

                notif = Notification(
                    user_id=user_id,
                    type='meeting_created',
                    message=(
                        f"✅ Meeting auto-scheduled: \"{title}\" on "
                        f"{final_start.strftime('%b %d at %I:%M %p')}{reschedule_note}"
                    ),
                    read=False,
                )
                db.add(notif)
                db.commit()
                logger.info("Auto-created meeting '%s' for user %s", title, user_id)

        except Exception as exc:
            logger.error("Error processing email %s: %s", email_obj.id, exc)
            db.rollback()
