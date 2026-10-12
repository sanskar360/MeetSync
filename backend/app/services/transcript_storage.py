import logging
import os
import re
from pathlib import Path
from uuid import UUID

from fastapi import UploadFile

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".txt", ".vtt", ".srt", ".md", ".json", ".pdf", ".docx"}


def _sanitize_filename(filename: str) -> str:
    """
    Sanitizes filename against path traversal attacks.
    """
    clean = os.path.basename(filename)
    clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", clean)
    return clean or "transcript"


def get_storage_base_dir() -> Path:
    base = Path(settings.TRANSCRIPT_STORAGE_DIR)
    base.mkdir(parents=True, exist_ok=True)
    return base


async def save_transcript_file(
    meeting_id: UUID,
    transcript_id: UUID,
    upload_file: UploadFile,
) -> tuple[str, int, str]:
    """
    Streams and saves the uploaded file to persistent storage.
    Enforces streaming size limits and path traversal defenses.
    Returns (storage_path, file_size, safe_extension).
    """
    original_name = upload_file.filename or "transcript.txt"
    safe_name = _sanitize_filename(original_name)
    ext = Path(safe_name).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    meeting_dir = get_storage_base_dir() / str(meeting_id)
    meeting_dir.mkdir(parents=True, exist_ok=True)

    dest_filename = f"{transcript_id}_{safe_name}"
    dest_path = meeting_dir / dest_filename

    total_bytes = 0
    max_bytes = settings.MAX_TRANSCRIPT_FILE_SIZE_BYTES

    try:
        with open(dest_path, "wb") as out_file:
            while chunk := await upload_file.read(1024 * 64):  # 64 KB chunks
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    raise ValueError(
                        f"File size exceeds maximum permitted limit of {max_bytes // (1024 * 1024)}MB"
                    )
                out_file.write(chunk)

    except Exception:
        # Atomic cleanup on failure
        if dest_path.exists():
            dest_path.unlink(missing_ok=True)
        raise

    return str(dest_path), total_bytes, ext


def delete_transcript_file(storage_path: str) -> None:
    """
    Deletes the stored file from disk if it exists.
    """
    try:
        p = Path(storage_path)
        if p.exists() and p.is_file():
            p.unlink()
            logger.info(f"Deleted transcript file: {storage_path}")
    except Exception as exc:
        logger.warning(f"Failed to delete transcript file {storage_path}: {exc}")
