import os
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "")

    TOKEN_ENCRYPTION_KEY: str = os.getenv("TOKEN_ENCRYPTION_KEY", "")

    GOOGLE_WEBHOOK_URL: str = os.getenv("GOOGLE_WEBHOOK_URL", "")

    GOOGLE_WATCH_RENEWAL_BUFFER_HOURS: int = int(
        os.getenv("GOOGLE_WATCH_RENEWAL_BUFFER_HOURS", "24")
    )
    GOOGLE_WATCH_RENEWAL_INTERVAL_SECONDS: int = int(
        os.getenv("GOOGLE_WATCH_RENEWAL_INTERVAL_SECONDS", "3600")
    )
    ENABLE_BACKGROUND_WATCH_SCHEDULER: bool = (
        os.getenv("ENABLE_BACKGROUND_WATCH_SCHEDULER", "true").lower()
        in ("true", "1", "yes")
    )


settings = Settings()