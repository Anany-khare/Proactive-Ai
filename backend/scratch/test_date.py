import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.models import User
from app.core.database import Base
from app.api.meetings import _sanitize_rfc3339

def test_sanitize():
    print("Testing JS DatePicker toISOString():")
    s1 = _sanitize_rfc3339("2026-05-08T14:00:00.000Z")
    print("ISO:", s1)

    s2 = _sanitize_rfc3339("2026-05-08 14:00")
    print("Naive space:", s2)

    s3 = _sanitize_rfc3339("2026-05-08T14:00")
    print("Naive T:", s3)

test_sanitize()
