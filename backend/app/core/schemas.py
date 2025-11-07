from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

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
    id: int
    from_email: str  # Use from_email as the field name
    subject: str
    preview: str
    priority: str = "medium"
    unread: bool = True
    timestamp: str
    time: str = None
    
    class Config:
        from_attributes = True

# Meeting Schemas
class MeetingBase(BaseModel):
    title: str
    time: str
    duration: str
    location: str
    attendees: List[str]

class MeetingResponse(MeetingBase):
    id: int
    upcoming: bool = True
    
    class Config:
        from_attributes = True

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

class NotificationUpdate(BaseModel):
    read: bool

# Dashboard Schemas
class DailyBrief(BaseModel):
    summary: str
    date: str

class Suggestion(BaseModel):
    id: int
    type: str
    message: str
    action: str

class DashboardData(BaseModel):
    dailyBrief: Optional[DailyBrief] = None
    emails: List[EmailResponse] = []
    meetings: List[MeetingResponse] = []
    todos: List[TodoResponse] = []
    notifications: List[NotificationResponse] = []
    suggestions: List[Suggestion] = []

