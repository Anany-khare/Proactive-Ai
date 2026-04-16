from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, EmailStr

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    picture: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

# Email Schemas
class EmailResponse(BaseModel):
    id: str
    from_email: str
    subject: Optional[str] = ""
    preview: Optional[str] = ""
    priority: str = "medium"
    unread: bool = True
    received_at: Optional[datetime] = None
    timestamp: str
    time: Optional[str] = None
    gmail_url: Optional[str] = None
    ai_insight: Optional[Dict[str, Any]] = None
    thread_id: Optional[str] = None
    snippet: Optional[str] = ""

    class Config:
        from_attributes = True

class EmailDetailResponse(BaseModel):
    id: str
    thread_id: Optional[str] = None
    from_email: str
    to: Optional[str] = "me"
    subject: str
    body: Optional[str] = None
    date: str
    unread: bool
    snippet: Optional[str] = ""
    gmail_url: Optional[str] = None

    class Config:
        from_attributes = True

class EmailReplyRequest(BaseModel):
    message_id: str
    reply_text: str

class EmailForwardRequest(BaseModel):
    message_id: str
    forward_to: str
    comment: Optional[str] = None

class EmailMarkReadRequest(BaseModel):
    message_id: str
    read: bool = True

class EmailThreadResponse(BaseModel):
    thread_id: str
    emails: List[EmailDetailResponse]

class EmailListResponse(BaseModel):
    emails: Optional[List[EmailResponse]] = None
    items: Optional[List[EmailResponse]] = None
    total: int = 0
    next_page_token: Optional[str] = None

# Meeting Schemas
class MeetingBase(BaseModel):
    title: str
    start_time: datetime
    end_time: datetime
    location: Optional[str] = None
    description: Optional[str] = None
    meet_link: Optional[str] = None
    attendees: Optional[str] = None  # JSON string

class MeetingCreate(BaseModel):
    title: str
    start_datetime: str
    end_datetime: str
    location: Optional[str] = None
    description: Optional[str] = None
    attendees: List[str] = []

class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    start_datetime: Optional[str] = None
    end_datetime: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    attendees: Optional[List[str]] = None

class MeetingResponse(BaseModel):
    id: Optional[Union[int, str]] = None
    title: str
    time: str
    duration: str
    location: str
    attendees: List[str]
    upcoming: bool
    date: Optional[str] = None
    start_datetime: Optional[str] = None
    end_datetime: Optional[str] = None
    description: Optional[str] = None
    meet_link: Optional[str] = None

    class Config:
        from_attributes = True

# New/Restored Schemas for Dashboard
class Suggestion(BaseModel):
    id: int
    type: str
    message: str
    action: str

class DailyBrief(BaseModel):
    greeting: str
    summary: str

# Todo Schemas
class TodoBase(BaseModel):
    task: str
    priority: str = "medium"
    due_date: Optional[str] = None
    category: Optional[str] = None

class TodoCreate(TodoBase):
    pass

class TodoResponse(TodoBase):
    id: int
    completed: bool = False
    
    class Config:
        from_attributes = True

class TodoUpdate(BaseModel):
    completed: Optional[bool] = None
    task: Optional[str] = None
    priority: Optional[str] = None

# Notification Schemas
class NotificationBase(BaseModel):
    type: str
    message: str
    related_id: Optional[int] = None

class NotificationResponse(NotificationBase):
    id: int
    read: bool = False
    time: str
    
    class Config:
        from_attributes = True

# Health Schemas
class HealthDataResponse(BaseModel):
    date: str
    sleep_minutes: Optional[int] = None
    sleep_score: Optional[int] = None
    steps: Optional[int] = 0
    readiness_score: Optional[int] = None
    readiness_label: Optional[str] = None
    source: Optional[str] = None
    resting_heart_rate: Optional[int] = None
    calories_burned: Optional[int] = None
    active_minutes: Optional[int] = None

# Action Schemas
class RescheduleRequest(BaseModel):
    event_id: str
    new_start: str
    new_end: str

class DraftEmailRequest(BaseModel):
    email_id: str
    tone: str = "professional"

class ActionResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

# Dashboard Schema
class DashboardData(BaseModel):
    dailyBrief: DailyBrief
    emails: List[EmailResponse]
    meetings: List[MeetingResponse]
    todos: List[TodoResponse]
    notifications: List[NotificationResponse]
    suggestions: List[Suggestion]
    health: Optional[HealthDataResponse] = None
    ai_insight: Optional[str] = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []

class ChatResponse(BaseModel):
    response: str
    suggested_actions: List[dict] = []

class TeamMemberResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    status: str = "Available"

    class Config:
        from_attributes = True

class TeamResponse(BaseModel):
    members: List[TeamMemberResponse]
