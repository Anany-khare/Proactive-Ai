"""
AI Service Layer — Ollama (local) + Gemini (cloud fallback) integration.

Primary:  Ollama at http://localhost:11434 (no API key, no rate limits)
Fallback: Google Gemini REST API (if Ollama is unreachable and GEMINI_API_KEY is set)

Fetches user context (emails, meetings, todos) from the DB and constructs
structured prompts so the LLM gives personalised answers.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.models import Email, Meeting, Todo, HealthData, Team

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fallback responses (returned when ALL LLMs are unavailable)
# ---------------------------------------------------------------------------
FALLBACK_CHAT_RESPONSE = (
    "I'm sorry, I'm unable to process your request right now. "
    "Please ensure Ollama is running (ollama serve) or check your Gemini API key."
)

FALLBACK_EMAIL_RESPONSE = (
    "Thank you for your email. I have received it and will review it shortly."
)

# ---------------------------------------------------------------------------
# LLM config
# ---------------------------------------------------------------------------
# Ollama (primary — local, no key required)
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3.2"  # change to any model you've pulled

# Gemini (fallback — cloud, needs API key)
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)
GEMINI_MODEL = "gemini-2.0-flash"


# ---------------------------------------------------------------------------
# User-context helpers
# ---------------------------------------------------------------------------

def get_user_context(user_id: int, db: Session) -> dict:
    """
    Query the DB for the user's current context:
      • unread email count
      • today's meetings (title + time)
      • pending todos (task + priority)
    """
    now_utc = datetime.now(timezone.utc)
    now_local = datetime.now().astimezone()
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    # Unread emails
    unread_count = (
        db.query(Email)
        .filter(Email.user_id == user_id, Email.is_read == False)  # noqa: E712
        .count()
    )

    # Upcoming meetings (next 7 days)
    upcoming_end = today_start + timedelta(days=7)
    meetings = (
        db.query(Meeting)
        .filter(
            Meeting.user_id == user_id,
            Meeting.start_time >= today_start,
            Meeting.start_time < upcoming_end,
        )
        .order_by(Meeting.start_time)
        .all()
    )
    # Filter out all-day events (like festivals) so they don't cause conflicts
    meetings = [m for m in meetings if not _is_all_day_event(m.start_time, m.end_time, m.title)]
    meetings_summary = [
        {
            "title": m.title or "(no title)",
            "date": m.start_time.strftime("%Y-%m-%d") if m.start_time else "TBD",
            "start": m.start_time.strftime("%I:%M %p") if m.start_time else "TBD",
            "end": m.end_time.strftime("%I:%M %p") if m.end_time else "",
            "location": m.location or "",
        }
        for m in meetings
    ]

    # Pending todos
    todos = (
        db.query(Todo)
        .filter(Todo.user_id == user_id, Todo.completed == False)  # noqa: E712
        .order_by(Todo.created_at.desc())
        .limit(10)
        .all()
    )
    todos_summary = [
        {"task": t.task, "priority": t.priority, "due": t.due_date or "no due date"}
        for t in todos
    ]

    # Health data (most recent)
    health_record = (
        db.query(HealthData)
        .filter(HealthData.user_id == user_id)
        .order_by(HealthData.date.desc())
        .first()
    )
    health_summary = None
    if health_record:
        from app.services.health_service import calculate_readiness
        sleep_mins = health_record.sleep_minutes or 0
        steps = health_record.steps or 0
        rhr = health_record.resting_heart_rate or 0
        score, label = calculate_readiness(sleep_mins, steps, rhr)
        health_summary = {
            "date": health_record.date,
            "sleep_hours": round(sleep_mins / 60, 1) if sleep_mins else 0,
            "steps": steps,
            "resting_heart_rate": rhr,
            "readiness_score": score,
            "readiness_label": label,
        }
    
    # Teams
    teams = db.query(Team).filter(Team.user_id == user_id).all()
    teams_summary = []
    for t in teams:
        members = t.members if isinstance(t.members, list) else []
        member_emails = [m.get('email', '') for m in members if isinstance(m, dict)]
        teams_summary.append({
            "name": t.name,
            "emails": member_emails
        })

    return {
        "current_time": now_local.isoformat(),
        "unread_emails": unread_count,
        "meetings_upcoming": meetings_summary,
        "pending_todos": todos_summary,
        "health": health_summary,
        "teams": teams_summary
    }


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _format_context_block(context: dict) -> str:
    """Turn the context dict into a readable block for the system prompt."""
    lines = []
    lines.append(f"Current System Offset Aware Date & Time: {context.get('current_time', 'Unknown')}")
    lines.append(f"Unread emails: {context['unread_emails']}")

    if context["meetings_upcoming"]:
        lines.append("Upcoming meetings (next 7 days):")
        for m in context["meetings_upcoming"]:
            loc = f" @ {m['location']}" if m["location"] else ""
            lines.append(f"  - [{m['date']}] {m['title']} ({m['start']}–{m['end']}{loc})")
    else:
        lines.append("No meetings scheduled for the next 7 days.")

    if context["pending_todos"]:
        lines.append("Pending to-dos:")
        for t in context["pending_todos"]:
            lines.append(f"  - [{t['priority']}] {t['task']} (due: {t['due']})")
    else:
        lines.append("No pending to-dos.")

    # Health & readiness
    health = context.get("health")
    if health:
        lines.append(f"\nHealth & Readiness (from {health['date']}):")
        lines.append(f"  - Sleep: {health['sleep_hours']} hours")
        lines.append(f"  - Steps: {health['steps']}")
        if health['resting_heart_rate']:
            lines.append(f"  - Resting HR: {health['resting_heart_rate']} bpm")
        lines.append(f"  - Readiness: {health['readiness_score']}/100 ({health['readiness_label']})")
    else:
        lines.append("\nNo health/wearable data available.")

    if context.get("teams"):
        lines.append("\nYour Teams:")
        for t in context["teams"]:
            lines.append(f"  - {t['name']}: {', '.join(t['emails'])}")

    return "\n".join(lines)


def build_chat_prompt(user_message: str, context: dict, history: List[Dict] = None) -> str:
    """Build a full prompt for general chat with optional conversation history."""
    ctx_block = _format_context_block(context)

    history_block = ""
    if history:
        history_lines = []
        for msg in history:
            role = "User" if msg['role'] == 'user' else "Assistant"
            history_lines.append(f"{role}: {msg['content']}")
        history_block = "\n=== Conversation History ===\n" + "\n".join(history_lines) + "\n"

    return (
        "You are a proactive, intelligent AI assistant embedded in a personal productivity dashboard. "
        "You have access to the user's real-time context shown below. Use it to give helpful, "
        "specific, and actionable answers. Be concise but thorough.\n\n"
        "IMPORTANT SCHEDULING RULE: If the user explicitly asks to schedule a new meeting, "
        "you MUST extract the details and output a JSON array block anywhere in your response EXACTLY like this:\n"
        "[SCHEDULE_MEETING] {\"title\": \"...\", \"start_datetime\": \"YYYY-MM-DDTHH:MM:00+05:30\", \"end_datetime\": \"YYYY-MM-DDTHH:MM:00+05:30\", \"location\": \"...\", \"description\": \"...\", \"attendees\": [\"email1@ex.com\", \"...\"], \"create_meet_link\": true/false} [/SCHEDULE_MEETING]\n"
        "TEAM LOOKUP: If the user explicitly mentions a team name (e.g., 'Marketing Team') from the context below, populate the `attendees` array with all member emails for that team. "
        "Strict Rule: DO NOT automatically include entire teams if the user only provides an individual email or name. Only include teams when the team name is mentioned.\n\n"
        "Ensure dates are strictly converted to ISO 8601 format natively PRESERVING the exact localized offset provided in the System Date. DO NOT output 'Z' or convert to UTC. Output conversational text acknowledging the action outside these tags.\n\n"
        f"=== User Context ===\n{ctx_block}\n=== End Context ===\n"
        f"{history_block}\n"
        f"User: {user_message}\n\n"
        "Assistant:"
    )


def build_email_reply_prompt(email_body: str, context: dict) -> str:
    """Build a prompt to generate a professional email reply."""
    ctx_block = _format_context_block(context)
    return (
        "You are a professional email assistant. Draft a polite, clear, and concise reply "
        "to the email below. Use the user's context to inform scheduling or task references "
        "if relevant. Output only the reply text — no subject line, no signature.\n\n"
        f"=== User Context ===\n{ctx_block}\n=== End Context ===\n\n"
        f"=== Original Email ===\n{email_body}\n=== End Email ===\n\n"
        "Reply:"
    )


# ---------------------------------------------------------------------------
# LLM calls
# ---------------------------------------------------------------------------

async def _call_ollama(prompt: str) -> Optional[str]:
    """Call the local Ollama REST API. Returns None if Ollama is unreachable."""
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.7,
            "num_predict": 1024,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, json=payload)
        if response.status_code == 200:
            data = response.json()
            text = data.get("response", "").strip()
            if text:
                logger.info("Ollama responded successfully (model=%s)", OLLAMA_MODEL)
                return text
            logger.warning("Ollama returned empty response")
            return None
        else:
            logger.warning("Ollama returned status %d: %s", response.status_code, response.text[:200])
            return None
    except httpx.ConnectError:
        logger.info("Ollama not running at %s — will try Gemini fallback", OLLAMA_BASE_URL)
        return None
    except httpx.TimeoutException:
        logger.warning("Ollama request timed out")
        return None
    except Exception as exc:
        logger.warning("Ollama call failed: %s", exc)
        return None


async def _call_gemini(prompt: str) -> Optional[str]:
    """Call Google Gemini REST API. Returns None on failure."""
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return None

    url = GEMINI_API_URL.format(model=GEMINI_MODEL, key=api_key)
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 1024,
        },
    }

    max_retries = 2
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload)

            if response.status_code == 200:
                data = response.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "").strip()
                return None

            elif response.status_code == 429:
                if attempt < max_retries - 1:
                    await asyncio.sleep(5)
                    continue
                logger.warning("Gemini rate-limited after retries")
                return None
            else:
                logger.error("Gemini error %d: %s", response.status_code, response.text[:200])
                return None
        except Exception as exc:
            logger.error("Gemini call failed: %s", exc)
            return None
    return None


async def generate_llm_response(prompt: str) -> str:
    """
    Try Ollama first (local, fast, no limits).
    Fall back to Gemini if Ollama is unavailable.
    Returns FALLBACK_CHAT_RESPONSE if both fail.
    """
    # 1. Try Ollama (primary)
    result = await _call_ollama(prompt)
    if result:
        return result

    # 2. Try Gemini (fallback)
    result = await _call_gemini(prompt)
    if result:
        return result

    # 3. All LLMs unavailable
    logger.error("All LLM backends unavailable (Ollama + Gemini)")
    return FALLBACK_CHAT_RESPONSE


# ---------------------------------------------------------------------------
# High-level public helpers used by the API endpoints
# ---------------------------------------------------------------------------

async def generate_chat_response(user_message: str, user_id: int, db: Session, history: List[Dict] = None) -> str:
    """Generate an AI chat response with user context and conversation history."""
    context = get_user_context(user_id, db)
    prompt = build_chat_prompt(user_message, context, history)
    return await generate_llm_response(prompt)


async def generate_email_reply(email_body: str, user_id: int, db: Session) -> str:
    """Generate an AI email reply with user context."""
    context = get_user_context(user_id, db)
    prompt = build_email_reply_prompt(email_body, context)
    response = await generate_llm_response(prompt)
    # If we got the generic chat fallback, use the email-specific one instead
    if response == FALLBACK_CHAT_RESPONSE:
        return FALLBACK_EMAIL_RESPONSE
    return response


async def extract_meeting_info(text: str, current_time: str) -> Dict:
    """
    Extract meeting details (title, start, end, location) from unstructured text.
    Returns a dict with extracted info.
    """
    prompt = (
        "You are a precise data extractor. Extract meeting details from the text below. "
        f"The current reference time is {current_time}. "
        "Return ONLY a JSON object with these keys: title, start_time (ISO format), "
        "end_time (ISO format), location, and notes. "
        "If a field is missing, use null. If multiple people are mentioned, prioritize the meeting subject. "
        "If the date is relative (e.g. 'tomorrow'), calculate it relative to the current time.\n\n"
        f"Text: {text}\n\n"
        "JSON:"
    )
    
    response = await generate_llm_response(prompt)
    
    import json
    import re
    try:
        # Try to find JSON block if the model added extra text
        match = re.search(r'(\{.*\})', response, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        return json.loads(response)
    except Exception:
        logger.error("Failed to parse meeting extraction JSON: %s", response)
        return {
            "title": "Meeting from Email",
            "start_time": None,
            "end_time": None,
            "location": None,
            "notes": "Extracted from email sentiment."
        }


# ---------------------------------------------------------------------------
# Proactive AI features
# ---------------------------------------------------------------------------

def _is_all_day_event(start_time, end_time, title: str = "") -> bool:
    """Check if a meeting is an all-day/holiday event (not a real timed meeting)."""
    if not start_time or not end_time:
        return True
    
    # 1. Check title for keywords that usually indicate background events
    t = (title or "").lower()
    if any(kw in t for kw in ["festival", "holiday", "birthday", "day off", "anniversary"]):
        return True

    # All-day events typically start at midnight and end at midnight next day
    s = start_time if start_time.tzinfo is None else start_time.replace(tzinfo=None)
    e = end_time if end_time.tzinfo is None else end_time.replace(tzinfo=None)
    
    # 2. Check for exact midnight bounds
    if s.hour == 0 and s.minute == 0 and e.hour == 0 and e.minute == 0:
        return True
        
    # 3. Check for very long duration (>= 12 hours) which usually aren't "meetings"
    if (e - s).total_seconds() >= 12 * 3600:
        return True
        
    return False


def get_upcoming_meetings(user_id: int, db: Session, days: int = 7) -> List[Dict]:
    """Get meetings for the next N days, excluding all-day/holiday events."""
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days)
    meetings = (
        db.query(Meeting)
        .filter(
            Meeting.user_id == user_id,
            Meeting.start_time.isnot(None),
            Meeting.end_time.isnot(None),
            Meeting.start_time >= now,
            Meeting.start_time < end,
        )
        .order_by(Meeting.start_time)
        .all()
    )
    return [
        {
            "id": m.id,
            "title": m.title or "(no title)",
            "start": m.start_time.isoformat() if m.start_time else "",
            "end": m.end_time.isoformat() if m.end_time else "",
            "location": m.location or "",
            "attendees": m.attendees or "[]",
        }
        for m in meetings
        if not _is_all_day_event(m.start_time, m.end_time, m.title)
    ]


def detect_meeting_conflicts_sync(user_id: int, db: Session) -> List[Dict]:
    """
    Find overlapping meetings for a user.
    Only compares real timed meetings on the same calendar day.
    Returns a list of conflict pairs with details.
    """
    meetings = get_upcoming_meetings(user_id, db, days=14)
    conflicts = []
    for i, m1 in enumerate(meetings):
        for m2 in meetings[i + 1:]:
            try:
                s1 = datetime.fromisoformat(m1["start"])
                e1 = datetime.fromisoformat(m1["end"])
                s2 = datetime.fromisoformat(m2["start"])
                e2 = datetime.fromisoformat(m2["end"])
            except (ValueError, TypeError):
                continue
            # Only compare meetings on the same calendar day
            if s1.date() != s2.date():
                continue
            # Overlap check: s1 < e2 and s2 < e1
            if s1 < e2 and s2 < e1:
                conflicts.append({
                    "meeting_a": m1,
                    "meeting_b": m2,
                    "overlap_start": max(s1, s2).isoformat(),
                    "overlap_end": min(e1, e2).isoformat(),
                })
    return conflicts


async def generate_dashboard_insights(user_id: int, db: Session) -> str:
    """
    Use Gemini to produce a concise, proactive daily briefing with
    conflict warnings and actionable suggestions.
    """
    context = get_user_context(user_id, db)
    conflicts = detect_meeting_conflicts_sync(user_id, db)

    conflict_block = ""
    if conflicts:
        lines = ["MEETING CONFLICTS DETECTED:"]
        for c in conflicts:
            lines.append(
                f"  ⚠ '{c['meeting_a']['title']}' overlaps with "
                f"'{c['meeting_b']['title']}' "
                f"({c['overlap_start']} – {c['overlap_end']})"
            )
        conflict_block = "\n".join(lines)

    ctx_block = _format_context_block(context)
    prompt = (
        "You are a proactive AI assistant in a personal productivity dashboard. "
        "Analyse the user's context below and produce a SHORT, actionable daily briefing "
        "(max 4 bullet points). Highlight scheduling conflicts, urgent emails, and "
        "upcoming deadlines. Be specific and concise. Do NOT use markdown bold formatting (like **). "
        "Use plain text and standard bullet points only.\n"
        "CRITICAL RULE: You MUST ONLY use the actual facts, names, times, and events explicitly listed in the User Context below. "
        "DO NOT invent, hallucinate, or guess any names, projects, people, or meetings. If the context is empty for a category, simply state there is nothing for that category.\n\n"
        f"=== User Context ===\n{ctx_block}\n"
    )
    if conflict_block:
        prompt += f"\n{conflict_block}\n"
    prompt += "\n=== End Context ===\n\nDaily Briefing:"

    return await generate_llm_response(prompt)


async def generate_conflict_resolution(
    conflicts: List[Dict], user_id: int, db: Session
) -> str:
    """
    Ask Gemini for a smart rescheduling suggestion for detected conflicts.
    """
    if not conflicts:
        return "No scheduling conflicts detected."

    meetings_ctx = get_upcoming_meetings(user_id, db, days=14)
    meetings_block = "\n".join(
        f"  - {m['title']} | {m['start']} to {m['end']} | {m['location']}"
        for m in meetings_ctx
    )

    conflict_block = "\n".join(
        f"  ⚠ '{c['meeting_a']['title']}' overlaps '{c['meeting_b']['title']}' "
        f"({c['overlap_start']}–{c['overlap_end']})"
        for c in conflicts
    )

    prompt = (
        "You are a smart scheduling assistant. The user has the following calendar "
        "(next 14 days):\n"
        f"{meetings_block}\n\n"
        "The following CONFLICTS exist:\n"
        f"{conflict_block}\n\n"
        "Suggest the best rescheduling options for the lower-priority meeting in each pair. "
        "Consider:  \n"
        " • Keep meetings with more attendees at their original time\n"
        " • Prefer moving shorter meetings\n"
        " • Suggest specific alternative time slots that don't conflict\n"
        " • Output a brief, actionable recommendation for each conflict.\n\n"
        "Suggestions:"
    )
    return await generate_llm_response(prompt)


async def generate_email_priority_summary(user_id: int, db: Session) -> str:
    """
    Summarise unread emails by priority and suggest which to act on first.
    """
    unread = (
        db.query(Email)
        .filter(Email.user_id == user_id, Email.is_read == False)  # noqa: E712
        .order_by(Email.received_at.desc())
        .limit(20)
        .all()
    )
    if not unread:
        return "You have no unread emails. Inbox zero! 🎉"

    email_lines = []
    for e in unread:
        email_lines.append(
            f"  - From: {e.sender or 'Unknown'} | Subject: {e.subject or '(none)'} "
            f"| Preview: {(e.preview or '')[:80]}"
        )
    emails_block = "\n".join(email_lines)

    prompt = (
        "You are an email triage assistant. Below are the user's unread emails.\n\n"
        f"=== Unread Emails ({len(unread)}) ===\n{emails_block}\n=== End ===\n\n"
        "Provide a SHORT summary (max 3 bullet points):\n"
        " 1. Which emails are high-priority and why\n"
        " 2. Which can be deferred\n"
        " 3. Any pattern or action suggestion\n\n"
        "Summary:"
    )
    return await generate_llm_response(prompt)
