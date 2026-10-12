# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db

router = APIRouter(tags=["Health"])


@router.get("/health")
@router.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "app": "MeetSync API",
    }


@router.get("/health/db")
@router.get("/api/health/db")
def database_health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))

    return {
        "status": "ok",
        "database": "connected",
    }