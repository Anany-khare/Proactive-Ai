from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, Team

router = APIRouter(prefix="/api/teams", tags=["teams"])


class TeamMember(BaseModel):
    name: str
    email: str


class TeamCreate(BaseModel):
    name: str
    members: List[TeamMember] = []


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    members: Optional[List[TeamMember]] = None


class TeamResponse(BaseModel):
    id: int
    name: str
    members: list
    created_at: str | None = None

    class Config:
        from_attributes = True


@router.get("/", response_model=List[TeamResponse])
async def list_teams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all teams for the current user."""
    teams = db.query(Team).filter(Team.user_id == current_user.id).order_by(Team.created_at.desc()).all()
    return [
        TeamResponse(
            id=t.id,
            name=t.name,
            members=t.members or [],
            created_at=t.created_at.isoformat() if t.created_at else None,
        )
        for t in teams
    ]


@router.post("/", response_model=TeamResponse)
async def create_team(
    data: TeamCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new team with named members."""
    team = Team(
        user_id=current_user.id,
        name=data.name.strip(),
        members=[m.dict() for m in data.members],
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return TeamResponse(
        id=team.id,
        name=team.name,
        members=team.members or [],
        created_at=team.created_at.isoformat() if team.created_at else None,
    )


@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: int,
    data: TeamUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a team's name or members."""
    team = db.query(Team).filter(Team.id == team_id, Team.user_id == current_user.id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if data.name is not None:
        team.name = data.name.strip()
    if data.members is not None:
        team.members = [m.dict() for m in data.members]
    db.commit()
    db.refresh(team)
    return TeamResponse(
        id=team.id,
        name=team.name,
        members=team.members or [],
        created_at=team.created_at.isoformat() if team.created_at else None,
    )


@router.delete("/{team_id}")
async def delete_team(
    team_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a team."""
    team = db.query(Team).filter(Team.id == team_id, Team.user_id == current_user.id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    db.delete(team)
    db.commit()
    return {"status": "deleted"}
