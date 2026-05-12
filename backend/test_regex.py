import re, json
raw_reply = '''I can definitely help you prep for that meeting with Notananykhare (notananykhare@gmail.com) at 3-3:30 PM today.
[SCHEDULE_MEETING] {"title": "Product Discussion with Notananykhare", "start_datetime": "2026-05-12T15:00:00+05:30", "end_datetime": "2026-05-12T15:30:00+05:30", "location": "", "description": "", "attendees": ["notananykhare@gmail.com"], "create_meet_link": true}'''
match = re.search(r'\[SCHEDULE_MEETING\]\s*(\{.*?\})\s*(?:\[/SCHEDULE_MEETING\])?', raw_reply, re.DOTALL)
clean = raw_reply.replace(match.group(0), '')
print(clean)
