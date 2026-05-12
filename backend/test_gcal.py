import json
import sqlite3
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

conn = sqlite3.connect(r'c:\Users\anany\OneDrive\Desktop\Proactive-Ai\backend\app.db')
cursor = conn.cursor()
cursor.execute("SELECT token FROM service_tokens WHERE service_name='google'")
row = cursor.fetchone()
if not row:
    print("No token found")
    exit()
    
token = row[0]
creds = Credentials.from_authorized_user_info(json.loads(token))
service = build('calendar', 'v3', credentials=creds)

event = {
    'summary': 'Product Discussion',
    'start': {'dateTime': '2026-05-12T15:00:00+05:30'},
    'end': {'dateTime': '2026-05-12T15:30:00+05:30'},
    'attendees': [{'email': 'notananykhare@gmail.com'}]
}
try:
    res = service.events().insert(calendarId='primary', body=event, sendUpdates='all').execute()
    print('Success:', res.get('id'))
except Exception as e:
    print('Error:', e)
