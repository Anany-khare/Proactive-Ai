import sys
import os
from dotenv import load_dotenv

# Load .env from backend
backend_dir = os.path.join(os.path.dirname(__file__), '..', 'backend')
load_dotenv(os.path.join(backend_dir, '.env'))
sys.path.append(backend_dir)

from app.core.database import SessionLocal
from app.core.models import User, ServiceToken
from app.core.google_services import CalendarService
from app.core.google_utils import get_google_credentials

def debug_calendar(user_id=1):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"User {user_id} not found")
            return

        print(f"Checking calendar for user: {user.email}")
        
        credentials = get_google_credentials(user, db)
        if not credentials:
            print("No Google credentials found for user.")
            return

        service = CalendarService(credentials)
        
        # 1. List Calendars
        print("\n--- Listing All Calendars ---")
        cal_list = service.service.calendarList().list().execute()
        items = cal_list.get('items', [])
        for cal in items:
            print(f"- {cal['summary']} (ID: {cal['id']}) [Access: {cal.get('accessRole')}]")

        # 2. Fetch Events (Next 7 Days)
        print("\n--- Fetching Events (Next 7 Days) from ALL calendars ---")
        now = datetime.utcnow().isoformat() + 'Z'
        next_week = (datetime.utcnow() + timedelta(days=7)).isoformat() + 'Z'
        
        events = service.get_events_by_date_range(now, next_week, max_results=20)
        
        if not events:
            print("No events found in the next 7 days.")
        else:
            for event in events:
                start = event.get('start_datetime', event.get('date'))
                print(f"- [{start}] {event.get('title')} (Cal: {event.get('calendar_name', 'Unknown')})")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    debug_calendar()
