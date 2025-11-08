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
        
        # Create credentials object
        creds = Credentials.from_authorized_user_info(credentials_dict)
        
        # The Google API client library will automatically refresh tokens when needed
        # But we can also explicitly refresh if expired (don't raise on error, let API handle it)
        try:
            if creds.expired and creds.refresh_token:
                from google.auth.transport.requests import Request
                creds.refresh(Request())
        except Exception as e:
            print(f"Note: Gmail credentials refresh attempted: {e}")
            # Don't raise - let the API call handle the error
            pass
        
        self.service = build('gmail', 'v1', credentials=creds)
    
    def get_unread_emails(self, max_results: int = 5) -> List[Dict]:
        """Fetch unread emails"""
        try:
            print(f"Fetching unread emails (max_results={max_results})...")
            results = self.service.users().messages().list(
                userId='me',
                q='is:unread',
                maxResults=max_results
            ).execute()
            
            messages = results.get('messages', [])
            print(f"Found {len(messages)} unread messages")
            emails = []
            
            if not messages:
                print("No unread messages found")
                return emails
            
            for msg in messages:
                try:
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
                    
                    # Check if actually unread
                    label_ids = message.get('labelIds', [])
                    is_unread = 'UNREAD' in label_ids
                    
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
                        'id': message['id'],
                        'thread_id': message.get('threadId', ''),
                        'from': from_email.split('<')[0].strip().strip('"') or from_email,
                        'subject': subject,
                        'preview': snippet[:100] + '...' if len(snippet) > 100 else snippet,
                        'priority': priority,
                        'unread': is_unread,
                        'time': time_ago
                    })
                except Exception as e:
                    print(f"Error processing message {msg.get('id', 'unknown')}: {e}")
                    continue
            
            print(f"Successfully processed {len(emails)} emails")
            return emails
        except HttpError as error:
            print(f'Gmail API error: {error}')
            print(f'Error details: {error.error_details if hasattr(error, "error_details") else "No details"}')
            print(f'Error status code: {error.resp.status if hasattr(error, "resp") else "Unknown"}')
            raise  # Re-raise to let caller handle it
        except Exception as error:
            print(f'Unexpected error fetching emails: {error}')
            import traceback
            traceback.print_exc()
            raise  # Re-raise to let caller handle it
    
    def get_recent_emails(self, max_results: int = 5) -> List[Dict]:
        """Fetch recent emails (both read and unread)"""
        try:
            print(f"Fetching recent emails (max_results={max_results})...")
            results = self.service.users().messages().list(
                userId='me',
                maxResults=max_results
            ).execute()
            
            messages = results.get('messages', [])
            print(f"Found {len(messages)} recent messages")
            emails = []
            
            if not messages:
                print("No recent messages found")
                return emails
            
            for msg in messages:
                try:
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
                    
                    # Check if actually unread
                    label_ids = message.get('labelIds', [])
                    is_unread = 'UNREAD' in label_ids
                    
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
                        'id': message['id'],
                        'thread_id': message.get('threadId', ''),
                        'from': from_email.split('<')[0].strip().strip('"') or from_email,
                        'subject': subject,
                        'preview': snippet[:100] + '...' if len(snippet) > 100 else snippet,
                        'priority': priority,
                        'unread': is_unread,
                        'time': time_ago
                    })
                except Exception as e:
                    print(f"Error processing message {msg.get('id', 'unknown')}: {e}")
                    continue
            
            print(f"Successfully processed {len(emails)} emails")
            return emails
        except HttpError as error:
            print(f'Gmail API error: {error}')
            print(f'Error details: {error.error_details if hasattr(error, "error_details") else "No details"}')
            print(f'Error status code: {error.resp.status if hasattr(error, "resp") else "Unknown"}')
            raise  # Re-raise to let caller handle it
        except Exception as error:
            print(f'Unexpected error fetching emails: {error}')
            import traceback
            traceback.print_exc()
            raise  # Re-raise to let caller handle it
    
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
    
    def get_email_by_id(self, message_id: str) -> Optional[Dict]:
        """Get full email details by message ID"""
        try:
            message = self.service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'
            ).execute()
            
            payload = message.get('payload', {})
            headers = payload.get('headers', [])
            
            # Extract headers
            from_email = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')
            to_email = next((h['value'] for h in headers if h['name'] == 'To'), '')
            subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
            date_str = next((h['value'] for h in headers if h['name'] == 'Date'), '')
            thread_id = message.get('threadId', '')
            
            # Get email body
            body = self._get_email_body(payload)
            
            # Check if read
            label_ids = message.get('labelIds', [])
            is_unread = 'UNREAD' in label_ids
            
            return {
                'id': message_id,
                'thread_id': thread_id,
                'from': from_email,
                'to': to_email,
                'subject': subject,
                'body': body,
                'date': date_str,
                'unread': is_unread,
                'snippet': message.get('snippet', '')
            }
        except HttpError as error:
            print(f'Error getting email: {error}')
            return None
    
    def _get_email_body(self, payload: Dict) -> str:
        """Extract email body from payload"""
        body = ""
        if 'parts' in payload:
            for part in payload['parts']:
                if part['mimeType'] == 'text/plain':
                    data = part['body'].get('data', '')
                    if data:
                        body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                        break
                elif part['mimeType'] == 'text/html':
                    data = part['body'].get('data', '')
                    if data:
                        body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
        else:
            if payload['mimeType'] == 'text/plain':
                data = payload['body'].get('data', '')
                if data:
                    body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
            elif payload['mimeType'] == 'text/html':
                data = payload['body'].get('data', '')
                if data:
                    body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
        return body
    
    def mark_email_read(self, message_id: str, read: bool = True) -> bool:
        """Mark email as read or unread"""
        try:
            if read:
                # Remove UNREAD label
                self.service.users().messages().modify(
                    userId='me',
                    id=message_id,
                    body={'removeLabelIds': ['UNREAD']}
                ).execute()
            else:
                # Add UNREAD label
                self.service.users().messages().modify(
                    userId='me',
                    id=message_id,
                    body={'addLabelIds': ['UNREAD']}
                ).execute()
            return True
        except HttpError as error:
            print(f'Error marking email: {error}')
            return False
    
    def delete_email(self, message_id: str) -> bool:
        """Delete an email"""
        try:
            self.service.users().messages().delete(
                userId='me',
                id=message_id
            ).execute()
            return True
        except HttpError as error:
            print(f'Error deleting email: {error}')
            return False
    
    def reply_to_email(self, message_id: str, reply_text: str, user_email: str) -> Optional[str]:
        """Reply to an email"""
        try:
            # Get original message
            original_message = self.service.users().messages().get(
                userId='me',
                id=message_id,
                format='metadata',
                metadataHeaders=['From', 'To', 'Subject', 'Message-ID']
            ).execute()
            
            headers = original_message['payload'].get('headers', [])
            from_email = next((h['value'] for h in headers if h['name'] == 'From'), '')
            subject = next((h['value'] for h in headers if h['name'] == 'Subject'), '')
            message_id_header = next((h['value'] for h in headers if h['name'] == 'Message-ID'), '')
            
            # Create reply message
            reply_subject = subject.startswith('Re:') and subject or f'Re: {subject}'
            
            message = email.message.EmailMessage()
            message['To'] = from_email
            message['From'] = user_email
            message['Subject'] = reply_subject
            message['In-Reply-To'] = message_id_header
            message['References'] = message_id_header
            message.set_content(reply_text)
            
            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
            
            # Send reply
            send_message = self.service.users().messages().send(
                userId='me',
                body={
                    'raw': raw_message,
                    'threadId': original_message.get('threadId')
                }
            ).execute()
            
            return send_message.get('id')
        except HttpError as error:
            print(f'Error replying to email: {error}')
            return None
    
    def forward_email(self, message_id: str, to_emails: List[str], forward_text: str, user_email: str) -> Optional[str]:
        """Forward an email"""
        try:
            # Get original message
            original_message = self.service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'
            ).execute()
            
            headers = original_message['payload'].get('headers', [])
            subject = next((h['value'] for h in headers if h['name'] == 'Subject'), '')
            from_email = next((h['value'] for h in headers if h['name'] == 'From'), '')
            
            # Get original body
            body = self._get_email_body(original_message['payload'])
            
            # Create forward message
            forward_subject = subject.startswith('Fwd:') and subject or f'Fwd: {subject}'
            
            message = email.message.EmailMessage()
            message['To'] = ', '.join(to_emails)
            message['From'] = user_email
            message['Subject'] = forward_subject
            message.set_content(f"{forward_text}\n\n---------- Forwarded message ----------\nFrom: {from_email}\nSubject: {subject}\n\n{body}")
            
            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
            
            # Send forward
            send_message = self.service.users().messages().send(
                userId='me',
                body={'raw': raw_message}
            ).execute()
            
            return send_message.get('id')
        except HttpError as error:
            print(f'Error forwarding email: {error}')
            return None
    
    def get_email_thread(self, thread_id: str) -> List[Dict]:
        """Get all emails in a thread"""
        try:
            thread = self.service.users().threads().get(
                userId='me',
                id=thread_id,
                format='full'
            ).execute()
            
            messages = []
            for msg in thread.get('messages', []):
                payload = msg.get('payload', {})
                headers = payload.get('headers', [])
                
                from_email = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')
                subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
                date_str = next((h['value'] for h in headers if h['name'] == 'Date'), '')
                body = self._get_email_body(payload)
                
                label_ids = msg.get('labelIds', [])
                is_unread = 'UNREAD' in label_ids
                
                messages.append({
                    'id': msg['id'],
                    'from': from_email,
                    'subject': subject,
                    'body': body,
                    'date': date_str,
                    'unread': is_unread,
                    'snippet': msg.get('snippet', '')
                })
            
            return messages
        except HttpError as error:
            print(f'Error getting thread: {error}')
            return []
    
    def get_all_emails(self, query: str = '', max_results: int = 50) -> List[Dict]:
        """Get all emails with optional query filter"""
        try:
            results = self.service.users().messages().list(
                userId='me',
                q=query,
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
                
                label_ids = message.get('labelIds', [])
                is_unread = 'UNREAD' in label_ids
                
                emails.append({
                    'id': message['id'],
                    'thread_id': message.get('threadId', ''),
                    'from': from_email.split('<')[0].strip().strip('"') or from_email,
                    'subject': subject,
                    'preview': message.get('snippet', '')[:100] + '...' if len(message.get('snippet', '')) > 100 else message.get('snippet', ''),
                    'unread': is_unread,
                    'time': date_str
                })
            
            return emails
        except HttpError as error:
            print(f'Error getting emails: {error}')
            return []

class CalendarService:
    def __init__(self, credentials_dict: Dict):
        """Initialize Calendar service with credentials"""
        # Add required fields if missing
        if 'client_id' not in credentials_dict:
            from app.core.config import settings
            credentials_dict['client_id'] = settings.GOOGLE_CLIENT_ID
            credentials_dict['client_secret'] = settings.GOOGLE_CLIENT_SECRET
        
        # Create credentials object
        creds = Credentials.from_authorized_user_info(credentials_dict)
        
        # The Google API client library will automatically refresh tokens when needed
        # But we can also explicitly refresh if expired
        try:
            if creds.expired and creds.refresh_token:
                from google.auth.transport.requests import Request
                creds.refresh(Request())
        except Exception as e:
            print(f"Error refreshing Calendar credentials: {e}")
            # Don't raise here - let the API call fail naturally with a better error message
            pass
        
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
    
    def get_event_by_id(self, event_id: str) -> Optional[Dict]:
        """Get a specific calendar event by ID"""
        try:
            event = self.service.events().get(
                calendarId='primary',
                eventId=event_id
            ).execute()
            
            return self._format_event(event)
        except HttpError as error:
            print(f'Error getting event: {error}')
            return None
    
    def _format_event(self, event: Dict) -> Dict:
        """Format event data into standardized format"""
        start = event['start'].get('dateTime', event['start'].get('date'))
        end = event['end'].get('dateTime', event['end'].get('date'))
        
        try:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
            duration = end_dt - start_dt
            duration_str = f"{int(duration.total_seconds() / 60)} min"
            time_str = start_dt.strftime('%I:%M %p')
            date_str = start_dt.strftime('%Y-%m-%d')
        except:
            time_str = start
            duration_str = "Unknown"
            date_str = start
        
        location = event.get('location', 'Not specified')
        attendees = [att.get('email', att.get('displayName', 'Unknown')) 
                   for att in event.get('attendees', [])]
        description = event.get('description', '')
        
        return {
            'id': event['id'],
            'title': event.get('summary', 'No Title'),
            'time': time_str,
            'date': date_str,
            'start_datetime': start,
            'end_datetime': end,
            'duration': duration_str,
            'location': location,
            'attendees': attendees,
            'description': description,
            'upcoming': True
        }
    
    def create_event(self, title: str, start_datetime: str, end_datetime: str, 
                     location: str = '', description: str = '', attendees: List[str] = None) -> Optional[Dict]:
        """Create a new calendar event"""
        try:
            event = {
                'summary': title,
                'start': {
                    'dateTime': start_datetime,
                    'timeZone': 'UTC',
                },
                'end': {
                    'dateTime': end_datetime,
                    'timeZone': 'UTC',
                },
            }
            
            if location:
                event['location'] = location
            if description:
                event['description'] = description
            if attendees:
                event['attendees'] = [{'email': email} for email in attendees]
            
            created_event = self.service.events().insert(
                calendarId='primary',
                body=event
            ).execute()
            
            return self._format_event(created_event)
        except HttpError as error:
            print(f'Error creating event: {error}')
            return None
    
    def update_event(self, event_id: str, title: str = None, start_datetime: str = None, 
                     end_datetime: str = None, location: str = None, 
                     description: str = None, attendees: List[str] = None) -> Optional[Dict]:
        """Update an existing calendar event"""
        try:
            # Get existing event
            event = self.service.events().get(
                calendarId='primary',
                eventId=event_id
            ).execute()
            
            # Update fields
            if title:
                event['summary'] = title
            if start_datetime:
                event['start'] = {
                    'dateTime': start_datetime,
                    'timeZone': 'UTC',
                }
            if end_datetime:
                event['end'] = {
                    'dateTime': end_datetime,
                    'timeZone': 'UTC',
                }
            if location is not None:
                event['location'] = location
            if description is not None:
                event['description'] = description
            if attendees is not None:
                event['attendees'] = [{'email': email} for email in attendees]
            
            updated_event = self.service.events().update(
                calendarId='primary',
                eventId=event_id,
                body=event
            ).execute()
            
            return self._format_event(updated_event)
        except HttpError as error:
            print(f'Error updating event: {error}')
            return None
    
    def delete_event(self, event_id: str) -> bool:
        """Delete a calendar event"""
        try:
            self.service.events().delete(
                calendarId='primary',
                eventId=event_id
            ).execute()
            return True
        except HttpError as error:
            print(f'Error deleting event: {error}')
            return False
    
    def get_events_by_date_range(self, start_date: str, end_date: str, max_results: int = 100) -> List[Dict]:
        """Get events within a date range (for calendar view)"""
        try:
            events_result = self.service.events().list(
                calendarId='primary',
                timeMin=start_date,
                timeMax=end_date,
                maxResults=max_results,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            return [self._format_event(event) for event in events]
        except HttpError as error:
            print(f'Error getting events: {error}')
            return []

