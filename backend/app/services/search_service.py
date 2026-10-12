import logging
import re
from typing import Any
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_meeting_role
from app.models.meeting import Meeting
from app.models.meeting_note import MeetingNote
from app.models.meeting_participant import MeetingParticipant
from app.models.transcript import Transcript
from app.models.user import User
from app.schemas.search import MeetingSearchQuery, MeetingSearchResult

logger = logging.getLogger(__name__)


def _extract_snippets(text: str, query: str, max_snippets: int = 2, window: int = 80) -> list[str]:
    """
    Extracts short text snippets around query matches.
    """
    if not text or not query:
        return []

    snippets = []
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    matches = list(pattern.finditer(text))

    for m in matches[:max_snippets]:
        start = max(0, m.start() - window)
        end = min(len(text), m.end() + window)
        prefix = "..." if start > 0 else ""
        suffix = "..." if end < len(text) else ""
        snip = f"{prefix}{text[start:end].strip()}{suffix}"
        snippets.append(snip)

    return snippets


def search_meetings_for_user(
    db: Session,
    user: User,
    query: MeetingSearchQuery,
) -> tuple[list[MeetingSearchResult], int]:
    """
    Executes scoped meeting search.
    Enforces meeting-membership scoping across all results, notes, and transcripts.
    """
    # 1. Base scoping: meetings where user is organizer or participant
    participated_ids = (
        db.query(MeetingParticipant.meeting_id)
        .filter(
            (MeetingParticipant.user_id == user.id)
            | (MeetingParticipant.email.ilike(user.email))
        )
        .subquery()
    )

    base_query = db.query(Meeting).filter(
        or_(
            Meeting.organizer_user_id == user.id,
            Meeting.organizer_email.ilike(user.email),
            Meeting.id.in_(participated_ids),
        )
    )

    # 2. Date filters
    if query.start_date:
        base_query = base_query.filter(Meeting.start_time >= query.start_date)
    if query.end_date:
        base_query = base_query.filter(Meeting.start_time <= query.end_date)

    # 3. Text query filter across title, notes, and transcripts
    if query.q:
        q_term = f"%{query.q.strip()}%"

        matching_note_meeting_ids = (
            db.query(MeetingNote.meeting_id)
            .filter(
                or_(
                    MeetingNote.title.ilike(q_term),
                    MeetingNote.content.ilike(q_term),
                )
            )
            .subquery()
        )

        matching_transcript_meeting_ids = (
            db.query(Transcript.meeting_id)
            .filter(Transcript.content_text.ilike(q_term))
            .subquery()
        )

        base_query = base_query.filter(
            or_(
                Meeting.title.ilike(q_term),
                Meeting.id.in_(matching_note_meeting_ids),
                Meeting.id.in_(matching_transcript_meeting_ids),
            )
        )

    # Fetch total matching meetings before pagination
    all_matching = base_query.order_by(Meeting.start_time.desc()).all()

    # 4. Role filter in memory / role check
    filtered_meetings: list[tuple[Meeting, str]] = []
    for m in all_matching:
        _, role = get_meeting_role(meeting_id=m.id, user=user, db=db)
        if query.role and role != query.role:
            continue
        filtered_meetings.append((m, role))

    total = len(filtered_meetings)

    # 5. Pagination
    offset = (query.page - 1) * query.limit
    page_meetings = filtered_meetings[offset : offset + query.limit]

    # 6. Build search results with snippets and counts
    results: list[MeetingSearchResult] = []
    for m, role in page_meetings:
        snippets: list[str] = []
        matching_notes_count = 0
        matching_transcripts_count = 0

        if query.q:
            # Check title
            if query.q.lower() in m.title.lower():
                snippets.append(f"Title: {m.title}")

            # Check notes
            notes = db.query(MeetingNote).filter(MeetingNote.meeting_id == m.id).all()
            for n in notes:
                snips = _extract_snippets(f"{n.title} - {n.content}", query.q)
                if snips:
                    matching_notes_count += 1
                    snippets.extend([f"Note: {s}" for s in snips[:1]])

            # Check transcripts
            transcripts = db.query(Transcript).filter(Transcript.meeting_id == m.id).all()
            for t in transcripts:
                snips = _extract_snippets(t.content_text, query.q)
                if snips:
                    matching_transcripts_count += 1
                    snippets.extend([f"Transcript: {s}" for s in snips[:1]])

        results.append(
            MeetingSearchResult(
                meeting_id=m.id,
                title=m.title,
                start_time=m.start_time,
                end_time=m.end_time,
                status=m.status,
                organizer_email=m.organizer_email,
                user_role=role,
                matching_notes_count=matching_notes_count,
                matching_transcripts_count=matching_transcripts_count,
                snippets=snippets[:3],
            )
        )

    return results, total
