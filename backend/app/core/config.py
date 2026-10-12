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

    # Authentication & Session Security (Phase 2)
    ENV: str = os.getenv("ENV", "development")
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY", "dev-insecure-secret-key-change-in-production-meetsync-32chars"
    )
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
    )

    # Transcript Storage & Processing (Phase 2)
    MAX_TRANSCRIPT_FILE_SIZE_BYTES: int = int(
        os.getenv("MAX_TRANSCRIPT_FILE_SIZE_BYTES", str(25 * 1024 * 1024))
    )
    TRANSCRIPT_MIN_WORD_COUNT: int = int(
        os.getenv("TRANSCRIPT_MIN_WORD_COUNT", "25")
    )
    TRANSCRIPT_STORAGE_BACKEND: str = os.getenv("TRANSCRIPT_STORAGE_BACKEND", "local")
    TRANSCRIPT_STORAGE_DIR: str = os.getenv("TRANSCRIPT_STORAGE_DIR", "storage/transcripts")


settings = Settings()