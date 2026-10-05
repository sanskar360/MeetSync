from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.calendar_sync import CalendarSync


def get_calendar_sync(
    db: Session,
    calendar_id,
) -> CalendarSync | None:
    return (
        db.query(CalendarSync)
        .filter(CalendarSync.calendar_id == calendar_id)
        .first()
    )


def get_sync_by_channel_id(
    db: Session,
    channel_id: str,
) -> CalendarSync | None:
    return (
        db.query(CalendarSync)
        .filter(CalendarSync.channel_id == channel_id)
        .first()
    )


def get_sync_by_resource_id(
    db: Session,
    resource_id: str,
) -> CalendarSync | None:
    return (
        db.query(CalendarSync)
        .filter(CalendarSync.resource_id == resource_id)
        .first()
    )


def create_calendar_sync(
    db: Session,
    calendar_id,
) -> CalendarSync:
    sync = CalendarSync(
        calendar_id=calendar_id,
        sync_status="pending",
    )

    db.add(sync)
    db.flush()

    return sync


def update_calendar_sync_channel(
    db: Session,
    sync: CalendarSync,
    channel_id: str,
    resource_id: str,
    channel_expiration: datetime | None = None,
) -> CalendarSync:
    sync.channel_id = channel_id
    sync.resource_id = resource_id
    sync.channel_expiration = channel_expiration
    db.flush()
    return sync


def clear_calendar_sync_channel(
    db: Session,
    sync: CalendarSync,
) -> CalendarSync:
    sync.channel_id = None
    sync.resource_id = None
    sync.channel_expiration = None
    db.flush()
    return sync


def get_calendar_syncs_needing_renewal(
    db: Session,
    before_time: datetime,
    for_update: bool = False,
) -> list[CalendarSync]:
    """
    Finds channels that will expire within the renewal buffer OR have already expired.
    Criteria:
        channel_id IS NOT NULL
        AND resource_id IS NOT NULL
        AND channel_expiration IS NOT NULL
        AND channel_expiration <= before_time
    """
    query = (
        db.query(CalendarSync)
        .filter(
            CalendarSync.channel_id.isnot(None),
            CalendarSync.resource_id.isnot(None),
            CalendarSync.channel_expiration.isnot(None),
            CalendarSync.channel_expiration <= before_time,
        )
    )
    if for_update:
        query = query.with_for_update(skip_locked=True)

    return query.all()


def get_expiring_calendar_syncs(
    db: Session,
    before_time: datetime,
    for_update: bool = False,
) -> list[CalendarSync]:
    """
    Backwards compatibility alias for get_calendar_syncs_needing_renewal.
    """
    return get_calendar_syncs_needing_renewal(
        db=db,
        before_time=before_time,
        for_update=for_update,
    )