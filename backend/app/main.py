import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.calendar import router as calendar_router
from app.api.routes.webhook import router as webhook_router
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


@app.get("/")
def root():
    return {
        "message": "MeetSync API is running"
    }
