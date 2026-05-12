import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.models import User
from app.core.database import Base
from app.api.meetings import _sanitize_rfc3339

def test_sanitize():
    print("Testing LLM output timezone:")
    s4 = _sanitize_rfc3339("2026-05-08T14:00:00+05:30")
    print("LLM With Offset:", s4)

test_sanitize()
