from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.core.cache import cache
import logging

router = APIRouter(prefix="/health", tags=["health"])
logger = logging.getLogger(__name__)

@router.get("")
async def health_check(response: Response, db: Session = Depends(get_db)):
    """
    Health check endpoint.
    - Checks DB (Critical)
    - Checks Redis (Optional)
    """
    health_status = {
        "status": "healthy",
        "database": "unknown",
        "redis": "unknown"
    }
    
    # 1. Check Database (Critical)
    try:
        db.execute(text("SELECT 1"))
        health_status["database"] = "connected"
    except Exception as e:
        logger.error(f"Health check failed (DB): {e}")
        health_status["database"] = "disconnected"
        health_status["status"] = "unhealthy"
        health_status["error"] = str(e)
        response.status_code = 503
        return health_status

    # 2. Check Redis (Optional - Degraded if down)
    if cache.enabled:
        try:
            if cache.client.ping():
                 health_status["redis"] = "connected"
        except Exception:
             health_status["redis"] = "disconnected"
             health_status["status"] = "degraded" # DB works, but cache/realtime down
    else:
        health_status["redis"] = "disabled"

    return health_status
