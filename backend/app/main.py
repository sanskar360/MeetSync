# pyrefly: ignore [missing-import]
from fastapi import FastAPI

app = FastAPI(
    title="MeetSync API",
    description="AI-driven meeting intelligence system",
    version="0.1.0",
)

@app.get("/")
def root():
    return {
        "message":"MeetSync API is running"
    }


