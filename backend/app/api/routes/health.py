from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.raw_event_storage import (
    get_storage_health_status,
    organize_existing_storage,
)

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


@router.get("/health/storage")
@router.get("/api/health/storage")
def storage_health():
    """
    Checks if local meeting storage is healthy, lists storage directories,
    file counts, and the searchable meetings catalog index.
    """
    return get_storage_health_status()


@router.post("/health/storage/organize")
@router.post("/api/health/storage/organize")
def trigger_storage_organization():
    """
    Triggers organization of any legacy flat event JSON files into date-based folders.
    """
    return organize_existing_storage()
