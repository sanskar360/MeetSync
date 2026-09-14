import json
from pathlib import Path


BASE_STORAGE_PATH = Path("storage/google_events")


def save_raw_event(
    google_event_id: str,
    event_data: dict,
) -> str:
    BASE_STORAGE_PATH.mkdir(parents=True, exist_ok=True)

    file_path = BASE_STORAGE_PATH / f"{google_event_id}.json"

    with file_path.open("w", encoding="utf-8") as file:
        json.dump(
            event_data,
            file,
            indent=2,
            ensure_ascii=False,
        )

    return str(file_path)