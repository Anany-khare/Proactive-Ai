import pytest
from datetime import datetime, timedelta
from app.services.ai_service import _is_all_day_event

def test_is_all_day_event_by_title():
    # Test keywords like 'holiday'
    start = datetime(2026, 5, 4, 10, 0)
    end = datetime(2026, 5, 4, 11, 0)
    assert _is_all_day_event(start, end, "Summer Holiday") is True
    assert _is_all_day_event(start, end, "Company Festival") is True

def test_is_all_day_event_by_midnight_bounds():
    # Test events that start and end at midnight
    start = datetime(2026, 5, 4, 0, 0)
    end = datetime(2026, 5, 5, 0, 0)
    assert _is_all_day_event(start, end, "Regular Project Work") is True

def test_is_all_day_event_by_duration():
    # Test long duration events (>= 12 hours)
    start = datetime(2026, 5, 4, 8, 0)
    end = datetime(2026, 5, 4, 21, 0) # 13 hours
    assert _is_all_day_event(start, end, "Workshop") is True

def test_is_not_all_day_event():
    # Normal 1-hour meeting
    start = datetime(2026, 5, 4, 14, 0)
    end = datetime(2026, 5, 4, 15, 0)
    assert _is_all_day_event(start, end, "Standup Meeting") is False

def test_is_all_day_event_missing_times():
    assert _is_all_day_event(None, None, "Invalid Event") is True
