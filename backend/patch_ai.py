import re

filepath = r'c:\Users\anany\OneDrive\Desktop\Proactive-Ai\backend\app\api\ai.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

old = """                # Cleanup the strict JSON logic from the bot's user-facing reply
                clean_reply = re.sub(r'\\[SCHEDULE_MEETING\\].*', '', raw_reply, flags=re.DOTALL).strip() + proactive_note"""

new = """                # Build a friendly confirmation instead of relying on (now-empty) LLM text
                if event:
                    try:
                        s_nice = datetime.fromisoformat(start_dt.replace('Z', '+00:00')).strftime('%I:%M %p')
                        e_nice = datetime.fromisoformat(end_dt.replace('Z', '+00:00')).strftime('%I:%M %p')
                        date_nice = datetime.fromisoformat(start_dt.replace('Z', '+00:00')).strftime('%B %d, %Y')
                    except Exception:
                        s_nice, e_nice, date_nice = start_dt, end_dt, ''
                    att_str = ', '.join(attendees) if attendees else 'no attendees'
                    clean_reply = (
                        f"Done! Your meeting has been scheduled.\\n\\n"
                        f"Title: {title}\\n"
                        f"Date: {date_nice}\\n"
                        f"Time: {s_nice} - {e_nice}\\n"
                        f"Attendees: {att_str}"
                    )
                    if create_meet_link and event.get('meet_link'):
                        clean_reply += f"\\nGoogle Meet: {event['meet_link']}"
                    clean_reply += proactive_note
                else:
                    clean_reply = "I tried to schedule the meeting but Google Calendar returned an error. Please try again." + proactive_note"""

if old in content:
    content = content.replace(old, new)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS")
else:
    print("NOT FOUND")
    # Debug
    idx = content.find("Cleanup the strict JSON")
    if idx >= 0:
        print(repr(content[idx:idx+200]))
    else:
        print("Cannot find Cleanup at all")
