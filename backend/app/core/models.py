from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
from cryptography.fernet import Fernet
import os
from app.core.config import settings

# Encryption key for sensitive data (in production, store this securely)
ENCRYPTION_KEY = settings.ENCRYPTION_KEY
if not ENCRYPTION_KEY:
    print("WARNING: ENCRYPTION_KEY not set in .env. Tokens will be lost on restart.")
    ENCRYPTION_KEY = Fernet.generate_key().decode()

if isinstance(ENCRYPTION_KEY, str):
    ENCRYPTION_KEY = ENCRYPTION_KEY.encode()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    picture = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_synced_at = Column(DateTime(timezone=True), nullable=True)

    # ── Working hours preferences ──────────────────────────────────────────
    work_start_hour = Column(Integer, default=9)   # 9 AM
    work_end_hour = Column(Integer, default=18)    # 6 PM
    weekends_enabled = Column(Boolean, default=False)

    # ── Leave management ───────────────────────────────────────────────────
    on_leave = Column(Boolean, default=False)
    leave_start_date = Column(String, nullable=True)   # YYYY-MM-DD
    leave_end_date = Column(String, nullable=True)     # YYYY-MM-DD
    leave_return_date = Column(String, nullable=True)  # Legacy/Calculated
    auto_pilot_enabled = Column(Boolean, default=False)

    # Relationships
    service_tokens = relationship("ServiceToken", back_populates="user", cascade="all, delete-orphan")
    todos = relationship("Todo", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    dashboard_cache = relationship("DashboardCache", back_populates="user", cascade="all, delete-orphan", uselist=False)
    push_subscriptions = relationship("PushSubscription", back_populates="user", cascade="all, delete-orphan")
    emails = relationship("Email", back_populates="user", cascade="all, delete-orphan")
    meetings = relationship("Meeting", back_populates="user", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="user", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="user", cascade="all, delete-orphan")
    health_data = relationship("HealthData", back_populates="user", cascade="all, delete-orphan")


class ServiceToken(Base):
    __tablename__ = "service_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    service_name = Column(String, nullable=False)  # gmail, calendar, etc.
    access_token_encrypted = Column(Text, nullable=False)
    refresh_token_encrypted = Column(Text, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index('idx_token_user_service', 'user_id', 'service_name'),
    )

    user = relationship("User", back_populates="service_tokens")

    @staticmethod
    def encrypt_token(token: str) -> str:
        f = Fernet(ENCRYPTION_KEY)
        return f.encrypt(token.encode()).decode()

    @staticmethod
    def decrypt_token(encrypted_token: str) -> str:
        f = Fernet(ENCRYPTION_KEY)
        return f.decrypt(encrypted_token.encode()).decode()


class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    task = Column(String, nullable=False)
    priority = Column(String, default="medium")  # high, medium, low
    due_date = Column(String, nullable=True)
    category = Column(String, nullable=True)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="todos")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)  # meeting, email, reminder, etc.
    message = Column(String, nullable=False)
    read = Column(Boolean, default=False)
    related_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="notifications")


class DashboardCache(Base):
    __tablename__ = "dashboard_cache"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    data = Column(JSON, nullable=False)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="dashboard_cache")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    endpoint = Column(Text, nullable=False)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="push_subscriptions")


class Email(Base):
    __tablename__ = "emails"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    thread_id = Column(String, index=True)
    subject = Column(String, nullable=True)
    sender = Column(String, nullable=True)
    preview = Column(Text, nullable=True)
    body = Column(Text, nullable=True)
    received_at = Column(DateTime(timezone=True), index=True)
    is_read = Column(Boolean, default=False)
    priority = Column(String, default="medium")  # high, medium, low
    # Track whether this email has already been processed for meeting creation
    # Persistent AI metadata
    ai_insight = Column(JSON, nullable=True)
    meeting_processed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_email_user_date', 'user_id', 'received_at'),
    )

    user = relationship("User", back_populates="emails")


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=True)
    start_time = Column(DateTime(timezone=True), index=True)
    end_time = Column(DateTime(timezone=True))
    location = Column(String, nullable=True)
    attendees = Column(JSON, nullable=True)
    description = Column(Text, nullable=True)
    # ── New Phase 3 fields ─────────────────────────────────────────────────
    meet_link = Column(String, nullable=True)       # Google Meet / Zoom / Teams URL
    source_email_id = Column(String, nullable=True)  # Email that triggered this meeting
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_meeting_user_start', 'user_id', 'start_time'),
    )

    user = relationship("User", back_populates="meetings")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String, nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_chat_user_created', 'user_id', 'created_at'),
    )

    user = relationship("User", back_populates="chat_messages")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    members = Column(JSON, nullable=False, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="teams")


class HealthData(Base):
    __tablename__ = "health_data"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    sleep_minutes = Column(Integer, nullable=True)
    sleep_score = Column(Integer, nullable=True)
    steps = Column(Integer, nullable=True, default=0)
    resting_heart_rate = Column(Integer, nullable=True)
    calories_burned = Column(Integer, nullable=True)
    active_minutes = Column(Integer, nullable=True)
    source = Column(String, default="fitbit")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index('idx_health_user_date', 'user_id', 'date', unique=True),
    )

    user = relationship("User", back_populates="health_data")
