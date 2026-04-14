"""
Health API Router — Google Fit (automatic) + Fitbit (optional) + Manual entry.

Source priority:
  1. Google Fit  — uses existing Google OAuth, no extra setup needed
  2. Fitbit      — requires dev.fitbit.com registration
  3. Manual      — user enters data directly

All sync endpoints try all sources automatically.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, HealthData
from app.core.schemas import HealthDataResponse
from app.core.config import settings
from app.services.health_service import (
    get_fitbit_auth_url,
    exchange_fitbit_code,
    save_fitbit_tokens,
    get_fitbit_access_token,
    sync_health_data,
    sync_google_fit_data,
    get_latest_health_data,
    calculate_readiness,
)

router = APIRouter(prefix="/api/health", tags=["health"])


# ─── Fitbit OAuth ─────────────────────────────────────────────────────────────

@router.get("/connect")
async def connect_fitbit(
    current_user: User = Depends(get_current_user),
):
    """Get the Fitbit OAuth authorization URL."""
    if not settings.FITBIT_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fitbit not configured. Add FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET to .env",
        )
    auth_url = get_fitbit_auth_url()
    return {"auth_url": auth_url}


@router.get("/callback")
async def fitbit_callback(
    code: str = Query(...),
    db: Session = Depends(get_db),
):
    """Handle Fitbit OAuth callback — exchange code for tokens and redirect."""
    token_data = await exchange_fitbit_code(code)
    if not token_data:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/?health_error=token_exchange_failed"
        )
    user = db.query(User).first()
    if user:
        save_fitbit_tokens(user.id, token_data, db)
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/health?connected=fitbit")


# ─── Status ───────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_health_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return connection status for all health sources.
    Google Fit is always available if user has Google OAuth.
    """
    fitbit_token = get_fitbit_access_token(current_user.id, db)

    # Check if Google credentials exist
    from app.core.models import ServiceToken
    google_token = db.query(ServiceToken).filter(
        ServiceToken.user_id == current_user.id,
        ServiceToken.service_name == "google",
    ).first()

    return {
        "google_fit": {
            "connected": google_token is not None,
            "note": "Uses your existing Google account — no extra setup needed",
        },
        "fitbit": {
            "connected": fitbit_token is not None,
            "note": "Requires dev.fitbit.com registration",
        },
        "connected": google_token is not None or fitbit_token is not None,
    }


# ─── Get Data ─────────────────────────────────────────────────────────────────

@router.get("/data", response_model=HealthDataResponse)
async def get_health_data(
    date: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get health data from the local DB cache — instant, no network calls.
    Fresh data is fetched only via POST /sync (user-triggered or background).
    """
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    # Read from DB only — no network calls, always fast
    data = get_latest_health_data(current_user.id, db)

    if data is None:
        return HealthDataResponse(
            date=date,
            sleep_minutes=None,
            sleep_score=None,
            steps=0,
            readiness_score=None,
            readiness_label="No Data",
            source="none",
        )

    return HealthDataResponse(**data)


# ─── Sync ─────────────────────────────────────────────────────────────────────

@router.post("/sync")
async def force_sync_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Force a fresh sync from all available sources.
    Tries Google Fit first (no setup needed), then Fitbit.
    Returns data from whichever source succeeds — does NOT require Fitbit.
    """
    today = datetime.now().strftime("%Y-%m-%d")

    # 1. Try Google Fit (automatic — uses existing Google OAuth)
    data = await sync_google_fit_data(current_user.id, db, today)
    if data:
        return {"status": "synced", "source": "google_fit", "data": data}

    # 2. Try Fitbit (if configured)
    fitbit_token = get_fitbit_access_token(current_user.id, db)
    if fitbit_token:
        from app.services.health_service import sync_fitbit_data
        data = await sync_fitbit_data(current_user.id, db, today)
        if data:
            return {"status": "synced", "source": "fitbit", "data": data}

    # 3. No automated source available — inform the user clearly
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={
            "message": "No health data found in Google Fit or Fitbit.",
            "reasons": [
                "Google Fit: Make sure your Android phone has synced data to the Google Fit app recently.",
                "Fitbit: Not connected. Register at dev.fitbit.com and add credentials to .env.",
            ],
            "suggestion": "Use the manual entry form to log your sleep and steps directly.",
        },
    )


# ─── Manual Entry ─────────────────────────────────────────────────────────────

@router.post("/manual")
async def add_manual_health_data(
    sleep_hours: float = Query(None, description="Hours of sleep (e.g. 7.5)"),
    steps: int = Query(None, description="Step count"),
    resting_hr: int = Query(None, description="Resting heart rate in bpm"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Manually log health data. Works without any wearable or Fitbit account.
    Useful for testing AI readiness features immediately.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    sleep_mins = int(sleep_hours * 60) if sleep_hours else None
    sleep_score = min(100, int((sleep_mins / 480) * 100)) if sleep_mins else None

    readiness_score, readiness_label = calculate_readiness(
        sleep_mins or 0, steps or 0, resting_hr or 0
    )

    existing = db.query(HealthData).filter(
        HealthData.user_id == current_user.id,
        HealthData.date == today,
    ).first()

    if existing:
        if sleep_mins is not None:
            existing.sleep_minutes = sleep_mins
            existing.sleep_score = sleep_score
        if steps is not None:
            existing.steps = steps
        if resting_hr is not None:
            existing.resting_heart_rate = resting_hr
        existing.source = "manual"
    else:
        db.add(HealthData(
            user_id=current_user.id,
            date=today,
            sleep_minutes=sleep_mins,
            sleep_score=sleep_score,
            steps=steps or 0,
            resting_heart_rate=resting_hr,
            source="manual",
        ))

    db.commit()

    return {
        "status": "saved",
        "data": {
            "date": today,
            "sleep_hours": sleep_hours,
            "steps": steps,
            "resting_heart_rate": resting_hr,
            "readiness_score": readiness_score,
            "readiness_label": readiness_label,
            "source": "manual",
        },
    }
