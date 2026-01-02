from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.models import User, DashboardCache

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.delete("/cache/clear")
async def clear_cache(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Clear user's dashboard cache"""
    try:
        cache = db.query(DashboardCache).filter(DashboardCache.user_id == current_user.id).first()
        if cache:
            db.delete(cache)
            db.commit()
            return {"status": "success", "message": "Cache cleared"}
        return {"status": "success", "message": "No cache to clear"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error clearing cache: {str(e)}"
        )


