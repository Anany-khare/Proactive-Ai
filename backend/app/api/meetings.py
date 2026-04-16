from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, ServiceToken, Notification
from app.core.schemas import MeetingResponse, MeetingCreate, MeetingUpdate
from app.core.google_services import CalendarService
from app.api.dashboard import get_google_credentials
from typing import List, Optional
from datetime import datetime, timedelta
import re

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

def _sanitize_rfc3339(dt_str: str) -> str:
    """
    Ensure a datetime string is valid RFC 3339 for the Google Calendar API.
    Strips trailing 'Z' from offset-aware strings, or appends 'Z' if naive.
    Adds seconds if missing from 'datetime-local' input formats.
    """
    if not dt_str:
        return dt_str
        
    dt_str = str(dt_str)
    # Fix datetime-local missing seconds ("YYYY-MM-DDThh:mm")
    if len(dt_str) == 16 and dt_str[10] == 'T':
        dt_str += ':00'
    elif len(dt_str) == 17 and dt_str.endswith('Z') and dt_str[10] == 'T':
        dt_str = dt_str[:-1] + ':00Z'

    # If the string has a UTC offset like +00:00 *and* a trailing Z, remove the Z
    if re.search(r'[+-]\d{2}:\d{2}Z$', dt_str):
        dt_str = dt_str[:-1]
    # If the string is entirely naive (no Z, no offset), append Z for UTC
    if not dt_str.endswith('Z') and '+' not in dt_str and not re.search(r'-\d{2}:\d{2}$', dt_str):
        dt_str += 'Z'
    return dt_str

@router.post("/", response_model=MeetingResponse)
async def create_meeting(
    meeting_data: MeetingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new meeting/event in Google Calendar"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        calendar_service = CalendarService(credentials)
        event = calendar_service.create_event(
            title=meeting_data.title,
            start_datetime=_sanitize_rfc3339(meeting_data.start_datetime),
            end_datetime=_sanitize_rfc3339(meeting_data.end_datetime),
            location=meeting_data.location,
            description=meeting_data.description,
            attendees=meeting_data.attendees
        )
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create meeting"
            )
        
        # Create notification for the meeting
        try:
            notification = Notification(
                user_id=current_user.id,
                type='meeting',
                message=f"Meeting '{meeting_data.title}' created",
                related_id=None  # Could store event ID if needed
            )
            db.add(notification)
            db.commit()
        except Exception as e:
            print(f"Error creating notification: {e}")
        
        return MeetingResponse(**event)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating meeting: {str(e)}"
        )

@router.get("/{event_id}", response_model=MeetingResponse)
async def get_meeting(
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific meeting by event ID"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        calendar_service = CalendarService(credentials)
        event = calendar_service.get_event_by_id(event_id)
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meeting not found"
            )
        
        return MeetingResponse(**event)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching meeting: {str(e)}"
        )

@router.patch("/{event_id}", response_model=MeetingResponse)
async def update_meeting(
    event_id: str,
    meeting_data: MeetingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing meeting"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        calendar_service = CalendarService(credentials)
        event = calendar_service.update_event(
            event_id=event_id,
            title=meeting_data.title,
            start_datetime=_sanitize_rfc3339(meeting_data.start_datetime) if meeting_data.start_datetime else None,
            end_datetime=_sanitize_rfc3339(meeting_data.end_datetime) if meeting_data.end_datetime else None,
            location=meeting_data.location,
            description=meeting_data.description,
            attendees=meeting_data.attendees
        )
        
        if not event:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update meeting"
            )
        
        # Create notification
        try:
            notification = Notification(
                user_id=current_user.id,
                type='meeting',
                message=f"Meeting '{event.get('title', '')}' updated",
                related_id=None
            )
            db.add(notification)
            db.commit()
        except Exception as e:
            print(f"Error creating notification: {e}")
        
        return MeetingResponse(**event)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating meeting: {str(e)}"
        )

@router.delete("/{event_id}")
async def delete_meeting(
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a meeting and notify attendees"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        from app.core.models import Meeting
        from app.services.proactive_service import send_cancellation_notification
        
        # 1. Fetch details before deletion (for notification)
        calendar_service = CalendarService(credentials)
        event = calendar_service.get_event_by_id(event_id)
        
        # 2. Delete from Google Calendar
        success = calendar_service.delete_event(event_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete meeting from Google Calendar"
            )
        
        # 3. Sync local DB: delete if exists
        db.query(Meeting).filter(Meeting.id == event_id).delete()
        
        # 4. Notify attendees via email
        if event and event.get('attendees'):
            send_cancellation_notification(
                user=current_user,
                meeting_title=event.get('title', 'Meeting'),
                start_time_str=event.get('time', 'specified time'),
                attendees=event.get('attendees', []),
                db=db
            )
        
        # 5. Create dashboard notification
        try:
            notification = Notification(
                user_id=current_user.id,
                type='meeting',
                message=f"Meeting '{event.get('title', 'Deleted')}' canceled and attendees notified",
                related_id=None
            )
            db.add(notification)
            db.commit()
        except Exception as e:
            print(f"Error creating notification: {e}")
        
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting meeting: {str(e)}"
        )

@router.post("/{event_id}/reschedule-manual", response_model=MeetingResponse)
async def reschedule_manual(
    event_id: str,
    meeting_data: MeetingUpdate, # Reusing MeetingUpdate for start/end times
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually reschedule a meeting and notify attendees"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    if not meeting_data.start_datetime or not meeting_data.end_datetime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New start and end times are required for rescheduling"
        )

    try:
        from app.core.models import Meeting
        from app.services.proactive_service import send_reschedule_notification
        
        # 1. Fetch old details
        calendar_service = CalendarService(credentials)
        old_event = calendar_service.get_event_by_id(event_id)
        if not old_event:
            raise HTTPException(status_code=404, detail="Meeting not found")

        old_start = old_event.get('start_datetime')
        new_start = _sanitize_rfc3339(meeting_data.start_datetime)
        new_end = _sanitize_rfc3339(meeting_data.end_datetime)

        # 2. Update Google Calendar
        updated = calendar_service.update_event(
            event_id=event_id,
            start_datetime=new_start,
            end_datetime=new_end,
        )
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update Google Calendar")

        # 3. Sync local DB
        local = db.query(Meeting).filter(Meeting.id == event_id).first()
        if local:
            local.start_time = datetime.fromisoformat(new_start.replace('Z', '+00:00'))
            local.end_time = datetime.fromisoformat(new_end.replace('Z', '+00:00'))
            db.commit()

        # 4. Notify attendees
        send_reschedule_notification(
            user=current_user,
            meeting=old_event,
            old_start=old_start,
            new_start=new_start,
            new_end=new_end,
            db=db
        )

        return MeetingResponse(**updated)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error rescheduling meeting: {str(e)}"
        )

@router.get("/range/events", response_model=List[MeetingResponse])
async def get_events_by_date_range(
    start_date: str,
    end_date: str,
    max_results: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get events within a date range (for calendar view)"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        calendar_service = CalendarService(credentials)
        events = calendar_service.get_events_by_date_range(start_date, end_date, max_results)
        
        return [MeetingResponse(**event) for event in events]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching events: {str(e)}"
        )

@router.get("/calendar/week", response_model=List[MeetingResponse])
async def get_weekly_events(
    week_start: Optional[str] = None,  # ISO format date string
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get events for a week (for weekly calendar view)"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        # Parse week_start or use current week
        if week_start:
            # Handle potential Z suffix if passed from frontend
            week_start = week_start.replace('Z', '+00:00')
            start_date = datetime.fromisoformat(week_start)
        else:
            # Start of current week (Monday)
            today = datetime.now()
            start_date = today - timedelta(days=today.weekday())
            # Set to beginning of day
            start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        
        end_date = start_date + timedelta(days=7)
        
        # Format for Google Calendar API — sanitize to valid RFC 3339
        start_iso = _sanitize_rfc3339(start_date.isoformat())
        end_iso = _sanitize_rfc3339(end_date.isoformat())
        
        calendar_service = CalendarService(credentials)
        # Increase limit just in case
        events = calendar_service.get_events_by_date_range(start_iso, end_iso, 250)
        
        return [MeetingResponse(**event) for event in events]
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching weekly events: {str(e)}"
        )

@router.get("/calendar/month", response_model=List[MeetingResponse])
async def get_monthly_events(
    month: Optional[str] = None,  # Format: YYYY-MM
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get events for a month (for monthly calendar view)"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        # Parse month or use current month
        if month:
            year, month_num = map(int, month.split('-'))
            start_date = datetime(year, month_num, 1)
        else:
            today = datetime.now()
            start_date = datetime(today.year, today.month, 1)
        
        # Calculate end of month
        if start_date.month == 12:
            end_date = datetime(start_date.year + 1, 1, 1)
        else:
            end_date = datetime(start_date.year, start_date.month + 1, 1)
        
        # Format for Google Calendar API — sanitize to valid RFC 3339
        start_iso = _sanitize_rfc3339(start_date.isoformat())
        end_iso = _sanitize_rfc3339(end_date.isoformat())
        
        calendar_service = CalendarService(credentials)
        events = calendar_service.get_events_by_date_range(start_iso, end_iso, 500)
        
        return [MeetingResponse(**event) for event in events]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching monthly events: {str(e)}"
        )
