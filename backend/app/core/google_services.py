from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import base64
import email
from email.utils import parsedate_to_datetime

class GmailService:
    def __init__(self, credentials_dict: Dict):
        """Initialize Gmail service with credentials"""
        # Add required fields if missing
        if 'client_id' not in credentials_dict:
            from app.core.config import settings
            credentials_dict['client_id'] = settings.GOOGLE_CLIENT_ID
            credentials_dict['client_secret'] = settings.GOOGLE_CLIENT_SECRET
        creds = Credentials.from_authorized_user_info(credentials_dict)
        self.service = build('gmail', 'v1', credentials=creds)
    
    def get_unread_emails(self, max_results: int = 5) -> List[Dict]:
        """Fetch unread emails"""
        try:
            results = self.service.users().messages().list(
                userId='me',
                q='is:unread',
                maxResults=max_results
            ).execute()
            
            messages = results.get('messages', [])
            emails = []
            
            for msg in messages:
                message = self.service.users().messages().get(
                    userId='me',
                    id=msg['id'],
                    format='metadata',
                    metadataHeaders=['From', 'Subject', 'Date']
                ).execute()
                
                headers = message['payload'].get('headers', [])
                from_email = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')
                subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
                date_str = next((h['value'] for h in headers if h['name'] == 'Date'), '')
                
                # Get snippet as preview
                snippet = message.get('snippet', '')
                
                # Determine priority (simple heuristic)
                priority = 'medium'
                if any(word in subject.lower() for word in ['urgent', 'important', 'asap', 'action required']):
                    priority = 'high'
                
                # Parse date
                try:
                    date_obj = parsedate_to_datetime(date_str) if date_str else datetime.now()
                    time_ago = self._get_time_ago(date_obj)
                except:
                    time_ago = "Unknown"
                
                emails.append({
                    'id': msg['id'],
                    'from': from_email.split('<')[0].strip().strip('"') or from_email,
                    'subject': subject,
                    'preview': snippet[:100] + '...' if len(snippet) > 100 else snippet,
                    'priority': priority,
                    'unread': True,
                    'time': time_ago
                })
            
            return emails
        except HttpError as error:
            print(f'An error occurred: {error}')
            return []
    
    def _get_time_ago(self, date_obj: datetime) -> str:
        """Calculate time ago string"""
        now = datetime.now(date_obj.tzinfo) if date_obj.tzinfo else datetime.now()
        diff = now - date_obj
        
        if diff.days > 0:
            return f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
        elif diff.seconds >= 3600:
            hours = diff.seconds // 3600
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        elif diff.seconds >= 60:
            minutes = diff.seconds // 60
            return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
        else:
            return "Just now"

class CalendarService:
    def __init__(self, credentials_dict: Dict):
        """Initialize Calendar service with credentials"""
        # Add required fields if missing
        if 'client_id' not in credentials_dict:
            from app.core.config import settings
            credentials_dict['client_id'] = settings.GOOGLE_CLIENT_ID
            credentials_dict['client_secret'] = settings.GOOGLE_CLIENT_SECRET
        creds = Credentials.from_authorized_user_info(credentials_dict)
        self.service = build('calendar', 'v3', credentials=creds)
    
    def get_upcoming_events(self, max_results: int = 3) -> List[Dict]:
        """Fetch upcoming calendar events"""
        try:
            now = datetime.utcnow().isoformat() + 'Z'
            tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat() + 'Z'
            
            events_result = self.service.events().list(
                calendarId='primary',
                timeMin=now,
                timeMax=tomorrow,
                maxResults=max_results,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            meetings = []
            
            for event in events:
                start = event['start'].get('dateTime', event['start'].get('date'))
                end = event['end'].get('dateTime', event['end'].get('date'))
                
                # Parse times
                try:
                    start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
                    end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
                    duration = end_dt - start_dt
                    duration_str = f"{int(duration.total_seconds() / 60)} min"
                    time_str = start_dt.strftime('%I:%M %p')
                except:
                    time_str = start
                    duration_str = "Unknown"
                
                location = event.get('location', 'Not specified')
                attendees = [att.get('email', att.get('displayName', 'Unknown')) 
                           for att in event.get('attendees', [])]
                
                meetings.append({
                    'id': event['id'],
                    'title': event.get('summary', 'No Title'),
                    'time': time_str,
                    'duration': duration_str,
                    'location': location,
                    'attendees': attendees[:5],  # Limit to 5 attendees
                    'upcoming': True
                })
            
            return meetings
        except HttpError as error:
            print(f'An error occurred: {error}')
            return []

