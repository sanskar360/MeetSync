# pyrefly: ignore [missing-import]
from fastapi import FastAPI
from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router

app = FastAPI(
    title="MeetSync API",
    description="AI-driven meeting intelligence system",
    version="0.1.0",
)

app.include_router(health_router)
app.include_router(auth_router)

@app.get("/")
def root():
    return {
        "message":"MeetSync API is running"
    }


