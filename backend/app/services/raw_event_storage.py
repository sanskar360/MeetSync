import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Absolute base storage path anchored to MeetSync backend/storage/google_events
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
BASE_STORAGE_PATH = BACKEND_DIR / "storage" / "google_events"
INDEX_FILE_PATH = BASE_STORAGE_PATH / "index.json"


def _sanitize_name(name: str, max_length: int = 40) -> str:
    """
    Sanitizes a meeting title for safe use in file/folder names across Windows/Linux.
    """
    if not name or not name.strip():
        return "untitled_meeting"
    # Replace invalid filesystem characters with underscores
    cleaned = re.sub(r'[\\/*?:"<>|#%\'\n\r\t]', '_', name.strip())
    # Collapse consecutive spaces/underscores
    cleaned = re.sub(r'[\s_]+', '_', cleaned).strip(' ._')
    return cleaned[:max_length] or "meeting"


def _extract_start_info(event_data: dict, start_time_param: Any = None) -> tuple[str, str]:
    """
    Extracts (YYYY-MM, YYYY-MM-DD) from event start or passed start_time.
    """
    # 1. Try passed datetime
    if isinstance(start_time_param, datetime):
        return start_time_param.strftime("%Y-%m"), start_time_param.strftime("%Y-%m-%d")

    # 2. Try event_data['start']
    start_obj = event_data.get("start", {})
    raw_date = start_obj.get("dateTime") or start_obj.get("date")

    if raw_date:
        try:
            # Handle ISO string like 2026-10-30T10:00:00Z or 2026-10-30
            dt = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
            return dt.strftime("%Y-%m"), dt.strftime("%Y-%m-%d")
        except Exception:
            # Fallback to string prefix if formatted like YYYY-MM-DD
            if len(str(raw_date)) >= 10 and str(raw_date)[4] == '-' and str(raw_date)[7] == '-':
                ymd = str(raw_date)[:10]
                return ymd[:7], ymd

    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m"), now.strftime("%Y-%m-%d")


def _update_catalog_index(entry: dict) -> None:
    """
    Updates the index.json catalog file with the latest meeting entry.
    """
    try:
        catalog = {}
        if INDEX_FILE_PATH.exists():
            try:
                with INDEX_FILE_PATH.open("r", encoding="utf-8") as f:
                    catalog = json.load(f)
                    if not isinstance(catalog, dict):
                        catalog = {}
            except Exception:
                catalog = {}

        event_id = entry.get("google_event_id")
        if event_id:
            catalog[event_id] = entry

        with INDEX_FILE_PATH.open("w", encoding="utf-8") as f:
            json.dump(catalog, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"Could not update meetings catalog index: {e}")


def save_raw_event(
    google_event_id: str,
    event_data: dict,
    title: str | None = None,
    start_time: Any = None,
) -> str:
    """
    Saves a raw Google Calendar event payload into a well-organized date directory.

    Structure:
      storage/google_events/
        ├── index.json                        (Searchable catalog of all meetings)
        ├── YYYY-MM/
        │   └── YYYY-MM-DD_[Clean_Title]_[event_id_prefix].json
        └── [event_id].json                   (Direct alias for backward compatibility)

    Returns:
      The normalized relative path to the organized JSON file.
    """
    BASE_STORAGE_PATH.mkdir(parents=True, exist_ok=True)

    # 1. Determine title and date
    resolved_title = title or event_data.get("summary") or "Untitled Meeting"
    clean_title = _sanitize_name(resolved_title)
    year_month, ymd = _extract_start_info(event_data, start_time)

    # 2. Create date-based month directory (e.g., storage/google_events/2026-10/)
    month_dir = BASE_STORAGE_PATH / year_month
    month_dir.mkdir(parents=True, exist_ok=True)

    # 3. Short event ID suffix for readable uniqueness
    short_id = re.sub(r'[^a-zA-Z0-9]', '', google_event_id)[-8:] if google_event_id else "event"
    organized_filename = f"{ymd}_{clean_title}_{short_id}.json"
    organized_path = month_dir / organized_filename

    # 4. Attach metadata envelope if not present
    enriched_data = dict(event_data)
    enriched_data["_meetsync_storage"] = {
        "google_event_id": google_event_id,
        "title": resolved_title,
        "date": ymd,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "status": event_data.get("status", "confirmed"),
    }

    # 5. Write organized JSON file
    with organized_path.open("w", encoding="utf-8") as f:
        json.dump(enriched_data, f, indent=2, ensure_ascii=False)

    # 6. Also write direct [google_event_id].json in BASE_STORAGE_PATH
    # for 100% backward compatibility with existing links/queries
    legacy_path = BASE_STORAGE_PATH / f"{google_event_id}.json"
    try:
        with legacy_path.open("w", encoding="utf-8") as f:
            json.dump(enriched_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.debug(f"Could not write legacy alias: {e}")

    # 7. Update central index.json
    rel_organized_path = f"storage/google_events/{year_month}/{organized_filename}"
    _update_catalog_index({
        "google_event_id": google_event_id,
        "title": resolved_title,
        "date": ymd,
        "start": event_data.get("start", {}),
        "status": event_data.get("status", "confirmed"),
        "organizer": event_data.get("organizer", {}).get("email"),
        "file_path": rel_organized_path,
        "absolute_path": str(organized_path),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(f"Saved event payload to organized storage: {rel_organized_path}")
    return rel_organized_path


def organize_existing_storage() -> dict:
    """
    Scans legacy flat JSON files in storage/google_events/ and organizes them into
    date-based subdirectories with an updated index.json.
    """
    if not BASE_STORAGE_PATH.exists():
        return {"status": "empty", "organized": 0}

    flat_files = [
        f for f in BASE_STORAGE_PATH.glob("*.json")
        if f.name != "index.json" and not f.name.startswith(".")
    ]

    count = 0
    for f in flat_files:
        try:
            with f.open("r", encoding="utf-8") as fp:
                data = json.load(fp)

            event_id = data.get("id") or f.stem
            summary = data.get("summary") or "Untitled Meeting"
            save_raw_event(google_event_id=event_id, event_data=data, title=summary)
            count += 1
        except Exception as e:
            logger.warning(f"Could not organize legacy event file {f.name}: {e}")

    return {"status": "ok", "organized": count, "storage_path": str(BASE_STORAGE_PATH)}


def get_storage_health_status() -> dict:
    """
    Returns diagnostic information verifying storage health, directory existence,
    total files, and list of cataloged meetings.
    """
    BASE_STORAGE_PATH.mkdir(parents=True, exist_ok=True)

    is_writable = False
    test_file = BASE_STORAGE_PATH / ".health_test"
    try:
        test_file.write_text("test", encoding="utf-8")
        test_file.unlink(missing_ok=True)
        is_writable = True
    except Exception:
        is_writable = False

    catalog = {}
    if INDEX_FILE_PATH.exists():
        try:
            with INDEX_FILE_PATH.open("r", encoding="utf-8") as f:
                catalog = json.load(f)
        except Exception:
            catalog = {}

    all_json_files = [
        str(p.relative_to(BASE_STORAGE_PATH))
        for p in BASE_STORAGE_PATH.glob("**/*.json")
        if p.name != "index.json"
    ]

    # Group meetings by month for easy browsing
    month_folders = [
        p.name for p in BASE_STORAGE_PATH.iterdir()
        if p.is_dir() and re.match(r'^\d{4}-\d{2}$', p.name)
    ]
    month_folders.sort(reverse=True)

    return {
        "status": "healthy" if is_writable else "error",
        "is_writable": is_writable,
        "base_storage_path": str(BASE_STORAGE_PATH),
        "total_json_files": len(all_json_files),
        "cataloged_meetings_count": len(catalog),
        "month_folders": month_folders,
        "recent_meetings": list(catalog.values())[-10:],
    }
