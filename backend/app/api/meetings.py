from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, ServiceToken, Notification
from app.core.schemas import MeetingResponse, MeetingCreate, MeetingUpdate
from app.core.google_services import CalendarService
from app.api.dashboard import get_google_credentials
from typing import List
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

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
            start_datetime=meeting_data.start_datetime,
            end_datetime=meeting_data.end_datetime,
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
            start_datetime=meeting_data.start_datetime,
            end_datetime=meeting_data.end_datetime,
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
    """Delete a meeting"""
    credentials = get_google_credentials(current_user, db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account not connected"
        )
    
    try:
        calendar_service = CalendarService(credentials)
        success = calendar_service.delete_event(event_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete meeting"
            )
        
        # Create notification
        try:
            notification = Notification(
                user_id=current_user.id,
                type='meeting',
                message="Meeting deleted",
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
    week_start: str = None,  # ISO format date string
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
            start_date = datetime.fromisoformat(week_start)
        else:
            # Start of current week (Monday)
            today = datetime.now()
            start_date = today - timedelta(days=today.weekday())
        
        end_date = start_date + timedelta(days=7)
        
        # Format for Google Calendar API (ISO 8601)
        start_iso = start_date.isoformat() + 'Z'
        end_iso = end_date.isoformat() + 'Z'
        
        calendar_service = CalendarService(credentials)
        events = calendar_service.get_events_by_date_range(start_iso, end_iso, 100)
        
        return [MeetingResponse(**event) for event in events]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching weekly events: {str(e)}"
        )

@router.get("/calendar/month", response_model=List[MeetingResponse])
async def get_monthly_events(
    month: str = None,  # Format: YYYY-MM
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
        
        # Format for Google Calendar API
        start_iso = start_date.isoformat() + 'Z'
        end_iso = end_date.isoformat() + 'Z'
        
        calendar_service = CalendarService(credentials)
        events = calendar_service.get_events_by_date_range(start_iso, end_iso, 500)
        
        return [MeetingResponse(**event) for event in events]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching monthly events: {str(e)}"
        )
