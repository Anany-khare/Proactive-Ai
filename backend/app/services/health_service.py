"""
Health Service — Google Fit + Fitbit integration for sleep, steps, and activity data.

Supports two automated sources:
  1. Google Fit — Uses existing Google OAuth credentials (automatic, no extra setup)
  2. Fitbit — Requires separate OAuth at dev.fitbit.com

Also supports manual data entry as a fallback.
"""

from datetime import datetime, timedelta
from typing import Optional, Dict

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.models import ServiceToken, HealthData

# ---------------------------------------------------------------------------
# Fitbit API endpoints
# ---------------------------------------------------------------------------
FITBIT_AUTH_URL = "https://www.fitbit.com/oauth2/authorize"
FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token"
FITBIT_API_BASE = "https://api.fitbit.com"
FITBIT_SCOPES = "activity heartrate sleep profile"


# ---------------------------------------------------------------------------
# Readiness calculation (shared by all sources)
# ---------------------------------------------------------------------------

def calculate_readiness(sleep_minutes: int, steps: int, resting_hr: int) -> tuple:
    """
    Calculate a 0-100 readiness score and label.
    Uses sleep, activity, and heart rate to determine overall readiness.
    """
    score = 50  # Base score

    # Sleep factor (0-40 points): 7-9 hours = optimal
    if sleep_minutes:
        hours = sleep_minutes / 60
        if hours >= 7:
            score += min(40, int((hours / 9) * 40))
        elif hours >= 5:
            score += int((hours / 7) * 25)
        else:
            score -= 10  # Penalty for very low sleep

    # Activity factor (0-10 points): 8000+ steps = good
    if steps:
        step_score = min(10, int((steps / 8000) * 10))
        score += step_score

    # Cap at 100
    score = max(0, min(100, score))

    # Label
    if score >= 80:
        label = "Excellent"
    elif score >= 60:
        label = "Good"
    elif score >= 40:
        label = "Fair"
    else:
        label = "Low"

    return score, label


# ═══════════════════════════════════════════════════════════════════════════════
# GOOGLE FIT — Uses existing Google OAuth (automatic, zero extra setup)
# ═══════════════════════════════════════════════════════════════════════════════

def _get_google_credentials(user_id: int, db: Session):
    """Get Google OAuth credentials for Fit API calls."""
    from app.core.google_utils import get_google_credentials
    from app.core.models import User
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    return get_google_credentials(user, db)


def _build_fit_service(credentials_dict: dict):
    """Build a Google Fit API service from credentials dict."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from app.core.config import settings

    if "client_id" not in credentials_dict:
        credentials_dict["client_id"] = settings.GOOGLE_CLIENT_ID
        credentials_dict["client_secret"] = settings.GOOGLE_CLIENT_SECRET

    creds = Credentials.from_authorized_user_info(credentials_dict)
    return build("fitness", "v1", credentials=creds)


async def fetch_google_fit_steps(user_id: int, db: Session, date: str = None) -> int:
    """Fetch step count from Google Fit for a given date."""
    creds = _get_google_credentials(user_id, db)
    if not creds:
        return 0

    try:
        service = _build_fit_service(creds)

        if not date:
            date = datetime.now().strftime("%Y-%m-%d")

        # Build time range for the date (midnight to midnight in local time → UTC ms)
        dt = datetime.strptime(date, "%Y-%m-%d")
        start_ms = int(dt.timestamp() * 1000)
        end_ms = int((dt + timedelta(days=1)).timestamp() * 1000)

        body = {
            "aggregateBy": [{
                "dataTypeName": "com.google.step_count.delta",
                # No dataSourceId — aggregate from ALL sources (Samsung Health, Android, etc.)
            }],
            "bucketByTime": {"durationMillis": 86400000},
            "startTimeMillis": start_ms,
            "endTimeMillis": end_ms,
        }

        result = service.users().dataset().aggregate(userId="me", body=body).execute()
        buckets = result.get("bucket", [])
        total_steps = 0
        for bucket in buckets:
            for dataset in bucket.get("dataset", []):
                for point in dataset.get("point", []):
                    for val in point.get("value", []):
                        total_steps += val.get("intVal", 0)

        return total_steps

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Google Fit steps error: {e}")
        if "403" in str(e) or "401" in str(e) or "Permission" in str(e):
            raise ValueError("Insufficient Google Fit Permissions")
        return 0


async def fetch_google_fit_sleep(user_id: int, db: Session, date: str = None) -> int:
    """Fetch sleep minutes from Google Fit for a given date."""
    creds = _get_google_credentials(user_id, db)
    if not creds:
        return 0

    try:
        service = _build_fit_service(creds)

        if not date:
            date = datetime.now().strftime("%Y-%m-%d")

        dt = datetime.strptime(date, "%Y-%m-%d")
        start_ms = int((dt - timedelta(hours=12)).timestamp() * 1000)
        end_ms = int((dt + timedelta(hours=12)).timestamp() * 1000)

        body = {
            "aggregateBy": [{"dataTypeName": "com.google.sleep.segment"}],
            "bucketByTime": {"durationMillis": 86400000},
            "startTimeMillis": start_ms,
            "endTimeMillis": end_ms,
        }

        result = service.users().dataset().aggregate(userId="me", body=body).execute()
        buckets = result.get("bucket", [])
        total_sleep_ms = 0
        for bucket in buckets:
            for dataset in bucket.get("dataset", []):
                for point in dataset.get("point", []):
                    start_ns = int(point.get("startTimeNanos", 0))
                    end_ns = int(point.get("endTimeNanos", 0))
                    sleep_type = 0
                    for val in point.get("value", []):
                        sleep_type = val.get("intVal", 0)
                    if sleep_type in (2, 4, 5, 6):
                        total_sleep_ms += (end_ns - start_ns) / 1_000_000

        total_sleep_minutes = int(total_sleep_ms / (1000 * 60))
        return total_sleep_minutes

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Google Fit sleep error: {e}")
        return 0


async def fetch_google_fit_heart_rate(user_id: int, db: Session, date: str = None) -> int:
    """Fetch resting heart rate from Google Fit."""
    creds = _get_google_credentials(user_id, db)
    if not creds:
        return 0

    try:
        service = _build_fit_service(creds)

        if not date:
            date = datetime.now().strftime("%Y-%m-%d")

        dt = datetime.strptime(date, "%Y-%m-%d")
        start_ms = int(dt.timestamp() * 1000)
        end_ms = int((dt + timedelta(days=1)).timestamp() * 1000)

        body = {
            "aggregateBy": [{"dataTypeName": "com.google.heart_rate.bpm"}],
            "bucketByTime": {"durationMillis": 86400000},
            "startTimeMillis": start_ms,
            "endTimeMillis": end_ms,
        }

        result = service.users().dataset().aggregate(userId="me", body=body).execute()
        hr_values = []
        for bucket in result.get("bucket", []):
            for dataset in bucket.get("dataset", []):
                for point in dataset.get("point", []):
                    for val in point.get("value", []):
                        fp = val.get("fpVal", 0)
                        if fp > 0:
                            hr_values.append(fp)

        if hr_values:
            resting = int(min(hr_values))
            return resting
        return 0

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Google Fit sleep error: {e}")
        return 0



async def fetch_google_fit_calories(user_id: int, db: Session, date: str = None) -> int:
    """Fetch calories burned from Google Fit."""
    creds = _get_google_credentials(user_id, db)
    if not creds:
        return 0
    try:
        service = _build_fit_service(creds)
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
        dt = datetime.strptime(date, "%Y-%m-%d")
        start_ms = int(dt.timestamp() * 1000)
        end_ms = int((dt + timedelta(days=1)).timestamp() * 1000)
        body = {
            "aggregateBy": [{"dataTypeName": "com.google.calories.expended"}],
            "bucketByTime": {"durationMillis": 86400000},
            "startTimeMillis": start_ms,
            "endTimeMillis": end_ms,
        }
        result = service.users().dataset().aggregate(userId="me", body=body).execute()
        total = 0
        for bucket in result.get("bucket", []):
            for dataset in bucket.get("dataset", []):
                for point in dataset.get("point", []):
                    for val in point.get("value", []):
                        total += val.get("fpVal", 0)
        calories = int(total)
        return calories
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Google Fit sleep error: {e}")
        return 0


async def fetch_google_fit_active_minutes(user_id: int, db: Session, date: str = None) -> int:
    """Fetch active minutes (Move Minutes) from Google Fit."""
    creds = _get_google_credentials(user_id, db)
    if not creds:
        return 0
    try:
        service = _build_fit_service(creds)
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
        dt = datetime.strptime(date, "%Y-%m-%d")
        start_ms = int(dt.timestamp() * 1000)
        end_ms = int((dt + timedelta(days=1)).timestamp() * 1000)
        body = {
            "aggregateBy": [{"dataTypeName": "com.google.active_minutes"}],
            "bucketByTime": {"durationMillis": 86400000},
            "startTimeMillis": start_ms,
            "endTimeMillis": end_ms,
        }
        result = service.users().dataset().aggregate(userId="me", body=body).execute()
        total = 0
        for bucket in result.get("bucket", []):
            for dataset in bucket.get("dataset", []):
                for point in dataset.get("point", []):
                    for val in point.get("value", []):
                        total += val.get("intVal", 0)
        return total
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Google Fit sleep error: {e}")
        return 0


async def sync_google_fit_data(user_id: int, db: Session, date: str = None) -> Optional[Dict]:
    """
    Fetch today's health data from Google Fit and upsert into HealthData table.
    Uses the EXISTING Google OAuth token — no extra setup needed.

    NOTE: Samsung Health does NOT push sleep to Google Fit. Sleep will be preserved
    from any existing manual entry in the DB rather than overwritten with 0.
    """
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    steps = await fetch_google_fit_steps(user_id, db, date)
    sleep_mins = await fetch_google_fit_sleep(user_id, db, date)
    resting_hr = await fetch_google_fit_heart_rate(user_id, db, date)
    calories = await fetch_google_fit_calories(user_id, db, date)
    active_mins = await fetch_google_fit_active_minutes(user_id, db, date)

    # Only fail if absolutely nothing came through (no Google Fit data at all)
    if steps == 0 and sleep_mins == 0 and resting_hr == 0 and calories == 0:
        return None

    # Fetch existing DB record to preserve manually-entered sleep if Google Fit
    # has no sleep data (Samsung Health limitation)
    existing = db.query(HealthData).filter(
        HealthData.user_id == user_id,
        HealthData.date == date,
    ).first()

    # Preserve existing sleep if Google Fit returned 0 (Samsung Health doesn't push sleep)
    final_sleep = sleep_mins if sleep_mins > 0 else (existing.sleep_minutes or 0 if existing else 0)

    sleep_score = min(100, int((final_sleep / 480) * 100)) if final_sleep else 0
    readiness_score, readiness_label = calculate_readiness(final_sleep, steps, resting_hr)

    if existing:
        if steps > 0:
            existing.steps = steps
        if sleep_mins > 0:
            existing.sleep_minutes = sleep_mins
            existing.sleep_score = sleep_score
        if resting_hr > 0:
            existing.resting_heart_rate = resting_hr
        if calories > 0:
            existing.calories_burned = calories
        if active_mins > 0:
            existing.active_minutes = active_mins
        existing.source = "google_fit"
    else:
        db.add(HealthData(
            user_id=user_id,
            date=date,
            sleep_minutes=final_sleep,
            sleep_score=sleep_score,
            steps=steps,
            resting_heart_rate=resting_hr,
            calories_burned=calories,
            active_minutes=active_mins,
            source="google_fit",
        ))
    db.commit()

    return {
        "date": date,
        "sleep_minutes": final_sleep,
        "sleep_score": sleep_score,
        "sleep_hours": round(final_sleep / 60, 1) if final_sleep else 0,
        "steps": steps,
        "resting_heart_rate": resting_hr,
        "calories_burned": calories,
        "active_minutes": active_mins,
        "readiness_score": readiness_score,
        "readiness_label": readiness_label,
        "source": "google_fit",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# FITBIT — Requires separate OAuth registration at dev.fitbit.com
# ═══════════════════════════════════════════════════════════════════════════════

def get_fitbit_auth_url() -> str:
    """Generate the Fitbit OAuth2 authorization URL."""
    params = {
        "response_type": "code",
        "client_id": settings.FITBIT_CLIENT_ID,
        "redirect_uri": settings.FITBIT_REDIRECT_URI,
        "scope": FITBIT_SCOPES,
        "expires_in": "604800",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{FITBIT_AUTH_URL}?{query}"


async def exchange_fitbit_code(code: str) -> Optional[Dict]:
    """Exchange authorization code for access + refresh tokens."""
    import base64
    auth_header = base64.b64encode(
        f"{settings.FITBIT_CLIENT_ID}:{settings.FITBIT_CLIENT_SECRET}".encode()
    ).decode()

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            FITBIT_TOKEN_URL,
            data={
                "client_id": settings.FITBIT_CLIENT_ID,
                "grant_type": "authorization_code",
                "redirect_uri": settings.FITBIT_REDIRECT_URI,
                "code": code,
            },
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
    if response.status_code == 200:
        return response.json()
    logger.error("Fitbit token exchange failed: %s", response.text)
    return None


def save_fitbit_tokens(user_id: int, token_data: dict, db: Session):
    """Store Fitbit tokens in the ServiceToken table."""
    existing = db.query(ServiceToken).filter(
        ServiceToken.user_id == user_id,
        ServiceToken.service_name == "fitbit",
    ).first()

    access_enc = ServiceToken.encrypt_token(token_data["access_token"])
    refresh_enc = ServiceToken.encrypt_token(token_data.get("refresh_token", ""))

    expires_at = None
    if "expires_in" in token_data:
        expires_at = datetime.utcnow() + timedelta(seconds=token_data["expires_in"])

    if existing:
        existing.access_token_encrypted = access_enc
        existing.refresh_token_encrypted = refresh_enc
        existing.expires_at = expires_at
    else:
        new_token = ServiceToken(
            user_id=user_id,
            service_name="fitbit",
            access_token_encrypted=access_enc,
            refresh_token_encrypted=refresh_enc,
            expires_at=expires_at,
        )
        db.add(new_token)
    db.commit()


def get_fitbit_access_token(user_id: int, db: Session) -> Optional[str]:
    """Retrieve the decrypted Fitbit access token for a user."""
    token_row = db.query(ServiceToken).filter(
        ServiceToken.user_id == user_id,
        ServiceToken.service_name == "fitbit",
    ).first()
    if not token_row:
        return None
    return ServiceToken.decrypt_token(token_row.access_token_encrypted)


async def fetch_fitbit_sleep(access_token: str, date: str = "today") -> Dict:
    """Fetch sleep data from Fitbit."""
    url = f"{FITBIT_API_BASE}/1.2/user/-/sleep/date/{date}.json"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            url, headers={"Authorization": f"Bearer {access_token}"}
        )
    if response.status_code != 200:
        return {}
    data = response.json()
    summary = data.get("summary", {})
    return {"total_minutes": summary.get("totalMinutesAsleep", 0)}


async def fetch_fitbit_activity(access_token: str, date: str = "today") -> Dict:
    """Fetch activity data from Fitbit."""
    url = f"{FITBIT_API_BASE}/1/user/-/activities/date/{date}.json"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            url, headers={"Authorization": f"Bearer {access_token}"}
        )
    if response.status_code != 200:
        return {}
    data = response.json()
    summary = data.get("summary", {})
    return {
        "steps": summary.get("steps", 0),
        "calories": summary.get("caloriesOut", 0),
        "active_minutes": summary.get("fairlyActiveMinutes", 0) + summary.get("veryActiveMinutes", 0),
        "resting_heart_rate": summary.get("restingHeartRate", 0),
    }


async def sync_fitbit_data(user_id: int, db: Session, date: str = None) -> Optional[Dict]:
    """Fetch health data from Fitbit and save to DB."""
    access_token = get_fitbit_access_token(user_id, db)
    if not access_token:
        return None

    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    try:
        sleep_data = await fetch_fitbit_sleep(access_token, date)
        activity_data = await fetch_fitbit_activity(access_token, date)
    except Exception as e:
        logger.warning("Failed to fetch Fitbit data: %s", e)
        return None

    sleep_mins = sleep_data.get("total_minutes", 0)
    steps = activity_data.get("steps", 0)
    resting_hr = activity_data.get("resting_heart_rate", 0)
    sleep_score = min(100, int((sleep_mins / 480) * 100)) if sleep_mins else 0
    readiness_score, readiness_label = calculate_readiness(sleep_mins, steps, resting_hr)

    existing = db.query(HealthData).filter(
        HealthData.user_id == user_id, HealthData.date == date
    ).first()

    if existing:
        existing.sleep_minutes = sleep_mins
        existing.sleep_score = sleep_score
        existing.steps = steps
        existing.resting_heart_rate = resting_hr
        existing.calories_burned = activity_data.get("calories", 0)
        existing.active_minutes = activity_data.get("active_minutes", 0)
        existing.source = "fitbit"
    else:
        db.add(HealthData(
            user_id=user_id, date=date, sleep_minutes=sleep_mins,
            sleep_score=sleep_score, steps=steps, resting_heart_rate=resting_hr,
            calories_burned=activity_data.get("calories", 0),
            active_minutes=activity_data.get("active_minutes", 0),
            source="fitbit",
        ))
    db.commit()

    return {
        "date": date, "sleep_minutes": sleep_mins, "sleep_score": sleep_score,
        "sleep_hours": round(sleep_mins / 60, 1) if sleep_mins else 0,
        "steps": steps, "resting_heart_rate": resting_hr,
        "calories_burned": activity_data.get("calories", 0),
        "active_minutes": activity_data.get("active_minutes", 0),
        "readiness_score": readiness_score, "readiness_label": readiness_label,
        "source": "fitbit",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# UNIFIED SYNC — Tries Google Fit first, then Fitbit, then cached DB
# ═══════════════════════════════════════════════════════════════════════════════

async def sync_health_data(user_id: int, db: Session, date: str = None) -> Optional[Dict]:
    """
    Try all automated sources in order:
      1. Google Fit (uses existing Google OAuth — zero extra setup)
      2. Fitbit (requires separate OAuth)
      3. Return None (fall back to manual/cached data)
    """
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    # 1. Try Google Fit first (automatic if user has Google OAuth + Android phone)
    data = await sync_google_fit_data(user_id, db, date)
    if data:
        return data

    # 2. Try Fitbit
    data = await sync_fitbit_data(user_id, db, date)
    if data:
        return data

    # 3. No automated source available
    return None


def get_latest_health_data(user_id: int, db: Session) -> Optional[Dict]:
    """Get the most recent health data from DB (any source)."""
    record = db.query(HealthData).filter(
        HealthData.user_id == user_id,
    ).order_by(HealthData.date.desc()).first()

    if not record:
        return None

    sleep_mins = record.sleep_minutes or 0
    steps = record.steps or 0
    resting_hr = record.resting_heart_rate or 0
    readiness_score, readiness_label = calculate_readiness(sleep_mins, steps, resting_hr)

    return {
        "date": record.date,
        "sleep_minutes": sleep_mins,
        "sleep_score": record.sleep_score or 0,
        "sleep_hours": round(sleep_mins / 60, 1) if sleep_mins else 0,
        "steps": steps,
        "resting_heart_rate": resting_hr,
        "calories_burned": record.calories_burned or 0,
        "active_minutes": record.active_minutes or 0,
        "readiness_score": readiness_score,
        "readiness_label": readiness_label,
        "source": record.source or "manual",
    }
