import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.calendar import router as calendar_router
from app.api.routes.webhook import router as webhook_router
from app.api.routes.meetings import router as meetings_router
from app.api.routes.notes import router as notes_router
from app.api.routes.transcripts import router as transcripts_router
from app.api.routes.search import router as search_router
from app.core.config import settings
from app.workers.watch_renewal import watch_renewal_scheduler_task

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_task = None
    if settings.ENABLE_BACKGROUND_WATCH_SCHEDULER:
        logger.info("Initializing background watch renewal scheduler...")
        scheduler_task = asyncio.create_task(watch_renewal_scheduler_task())
    else:
        logger.info("Background watch renewal scheduler is disabled by configuration.")

    try:
        yield
    finally:
        if scheduler_task and not scheduler_task.done():
            logger.info("Stopping background watch renewal scheduler...")
            scheduler_task.cancel()
            try:
                await scheduler_task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="MeetSync API",
    description="AI-driven meeting intelligence system",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(calendar_router)
app.include_router(webhook_router)
# search_router MUST be registered before meetings_router because both share
# the /api/meetings prefix.  meetings_router defines /{meeting_id} which would
# greedily match /search and /past (treating them as UUID strings → 422).
app.include_router(search_router)
app.include_router(meetings_router)
app.include_router(notes_router)
app.include_router(transcripts_router)


# Serve frontend static files
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "frontend" / "dist"
if (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")


@app.get("/")
def root():
    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "MeetSync API is running"}


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    # Only fallback for non-API, non-docs routes
    if full_path.startswith(("api/", "docs", "redoc", "openapi.json")):
        return {"detail": "Not Found"}
    file_path = DIST_DIR / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))
    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"detail": "Not Found"}
