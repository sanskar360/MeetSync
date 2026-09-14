from datetime import datetime


def parse_google_event(event: dict) -> dict:
    """
    Convert a Google Calendar event payload into
    the fields MeetSync needs for the meetings table.
    """

    start_data = event.get("start", {})
    end_data = event.get("end", {})

    start_time = _parse_event_datetime(start_data)
    end_time = _parse_event_datetime(end_data)

    organizer = event.get("organizer", {})

    return {
        "google_event_id": event["id"],
        "google_ical_uid": event.get("iCalUID"),
        "title": event.get("summary", "(No title)"),
        "start_time": start_time,
        "end_time": end_time,
        "meet_url": event.get("hangoutLink"),
        "organizer_email": organizer.get("email"),
        "event_type": event.get("eventType", "default"),
        "google_updated_at": _parse_timestamp(event.get("updated")),
        "google_etag": event.get("etag"),
        "google_sequence": event.get("sequence"),
        "status": event.get("status", "confirmed"),
        "attendees": event.get("attendees", []),
    }


def _parse_event_datetime(data: dict) -> datetime:
    """
    Parse a Google Calendar start/end object.

    Timed events use:
        dateTime

    All-day events use:
        date
    """

    if "dateTime" in data:
        return datetime.fromisoformat(
            data["dateTime"].replace("Z", "+00:00")
        )

    if "date" in data:
        return datetime.fromisoformat(data["date"])

    raise ValueError("Google Calendar event has no valid start/end time")


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None

    return datetime.fromisoformat(
        value.replace("Z", "+00:00")
    )