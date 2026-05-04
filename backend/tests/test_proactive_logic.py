import pytest
from app.services.proactive_service import _meeting_priority_score, pick_meeting_to_move

def test_meeting_priority_score_base():
    meeting = {"title": "Team Sync", "attendees": []}
    # "sync" lowers score by 100
    assert _meeting_priority_score(meeting) == -100

def test_meeting_priority_score_high_priority_keywords():
    meeting = {"title": "Urgent Board Meeting", "attendees": []}
    # Currently "board" in title or "investor" in title or "urgent" in title only adds 500 once
    assert _meeting_priority_score(meeting) == 500

def test_meeting_priority_score_attendees():
    # 3 attendees in list
    meeting = {"title": "Regular discussion", "attendees": [{"email": "a@a.com"}, {"email": "b@b.com"}, {"email": "c@c.com"}]}
    assert _meeting_priority_score(meeting) == 30

def test_pick_meeting_to_move():
    meeting_a = {"title": "1:1 with Manager", "attendees": []} # score: 50
    meeting_b = {"title": "Coffee break", "attendees": []} # score: -100

    conflict = {
        "meeting_a": meeting_a,
        "meeting_b": meeting_b
    }
    
    # Should pick meeting_b to move because it has a lower score
    assert pick_meeting_to_move(conflict) == meeting_b

def test_pick_meeting_to_move_equal_priority():
    meeting_a = {"title": "Unknown Meeting 1", "attendees": []} # score: 0
    meeting_b = {"title": "Unknown Meeting 2", "attendees": []} # score: 0

    conflict = {
        "meeting_a": meeting_a,
        "meeting_b": meeting_b
    }
    
    # If equal, it defaults to returning meeting_b
    assert pick_meeting_to_move(conflict) == meeting_b
