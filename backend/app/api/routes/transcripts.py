import logging
import os
import uuid
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import (
    get_current_user,
    require_meeting_member,
    require_meeting_roles,
)
from app.models.meeting import Meeting
from app.models.transcript import Transcript
from app.models.user import User
from app.repositories.transcript_repository import (
    create_transcript,
    get_transcript_by_id,
    list_transcripts_by_meeting_id,
)
from app.schemas.transcript import (
    TranscriptListResponse,
    TranscriptResponse,
    TranscriptTextResponse,
    ValidationReportSchema,
)
from app.services.transcript_parser import parse_transcript_file
from app.services.transcript_storage import (
    delete_transcript_file,
    save_transcript_file,
)
from app.services.transcript_validator import validate_parsed_transcript

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/meetings/{meeting_id}/transcripts",
    tags=["Transcripts"],
)


def _to_transcript_response(t: Transcript) -> TranscriptResponse:
    report = t.validation_flags or {}
    return TranscriptResponse(
        id=t.id,
        meeting_id=t.meeting_id,
        uploaded_by_user_id=t.uploaded_by_user_id,
        original_filename=t.original_filename,
        file_format=t.file_format,
        file_size=t.file_size,
        validation_status=t.validation_status,
        validation_report=ValidationReportSchema(
            status=t.validation_status,
            participant_mismatch=report.get("participant_mismatch", False),
            timestamp_match=report.get("timestamp_match", True),
            format_valid=report.get("format_valid", True),
            detected_speakers=report.get("detected_speakers", []),
            warnings=report.get("warnings", []),
            word_count=report.get("word_count", 0),
            details=report.get("details", {}),
        ),
        created_at=t.created_at,
    )


@router.post("", response_model=TranscriptResponse, status_code=status.HTTP_201_CREATED)
async def upload_transcript(
    meeting_id: UUID,
    file: UploadFile = File(...),
    auth_context: tuple[Meeting, str] = Depends(require_meeting_roles(["note_taker"])),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Uploads a transcript file.
    Strictly restricted to the Note Taker of this meeting.
    Performs streaming size limit checks, multi-format text parsing, and deterministic validation.
    """
    meeting, _ = auth_context
    transcript_id = uuid.uuid4()
    saved_path = None

    try:
        # 1. Stream file to storage with size bound enforcement
        saved_path, file_size, ext = await save_transcript_file(
            meeting_id=meeting.id,
            transcript_id=transcript_id,
            upload_file=file,
        )

        # 2. Parse file content
        parsed = parse_transcript_file(file_path=saved_path, ext=ext)

        # 3. Deterministic validation
        validation_report = validate_parsed_transcript(parsed=parsed, meeting=meeting)

        # 4. Save metadata to DB
        transcript = create_transcript(
            db=db,
            meeting_id=meeting.id,
            uploaded_by_user_id=current_user.id,
            original_filename=file.filename or f"transcript{ext}",
            storage_path=saved_path,
            file_format=ext,
            file_size=file_size,
            content_text=parsed["text"],
            validation_status=validation_report["status"],
            validation_flags=validation_report,
        )

        logger.info(
            f"Transcript {transcript.id} uploaded successfully for meeting {meeting.id} with status '{transcript.validation_status}'"
        )
        return _to_transcript_response(transcript)

    except ValueError as exc:
        if saved_path:
            delete_transcript_file(saved_path)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    except Exception as exc:
        if saved_path:
            delete_transcript_file(saved_path)
        logger.error(f"Transcript upload failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process transcript: {exc}",
        )


@router.get("", response_model=TranscriptListResponse)
def list_transcripts(
    meeting_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_member),
    db: Session = Depends(get_db),
):
    """
    Lists metadata and validation reports for transcripts in this meeting.
    Available to all authenticated meeting members.
    Heavy transcript text is omitted to maintain lightweight responses.
    """
    meeting, _ = auth_context
    transcripts = list_transcripts_by_meeting_id(db=db, meeting_id=meeting.id)

    items = [_to_transcript_response(t) for t in transcripts]
    return TranscriptListResponse(
        meeting_id=meeting.id,
        transcripts=items,
        count=len(items),
    )


@router.get("/{transcript_id}", response_model=TranscriptResponse)
def get_transcript_details(
    meeting_id: UUID,
    transcript_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_member),
    db: Session = Depends(get_db),
):
    """
    Retrieves metadata and validation report for a single transcript.
    Available to all authenticated meeting members.
    """
    meeting, _ = auth_context
    transcript = get_transcript_by_id(db=db, transcript_id=transcript_id, meeting_id=meeting.id)

    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcript not found for this meeting.",
        )

    return _to_transcript_response(transcript)


@router.get("/{transcript_id}/text", response_model=TranscriptTextResponse)
def get_transcript_text(
    meeting_id: UUID,
    transcript_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_member),
    db: Session = Depends(get_db),
):
    """
    Dedicated endpoint to fetch extracted transcript text.
    Available to all authenticated meeting members.
    """
    meeting, _ = auth_context
    transcript = get_transcript_by_id(db=db, transcript_id=transcript_id, meeting_id=meeting.id)

    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcript not found for this meeting.",
        )

    word_count = len(transcript.content_text.split())

    return TranscriptTextResponse(
        id=transcript.id,
        meeting_id=transcript.meeting_id,
        content_text=transcript.content_text,
        word_count=word_count,
    )


@router.get("/{transcript_id}/file")
def download_transcript_file(
    meeting_id: UUID,
    transcript_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_member),
    db: Session = Depends(get_db),
):
    """
    Streams the raw transcript file for download.
    Strictly authorized to authenticated meeting members.
    """
    meeting, _ = auth_context
    transcript = get_transcript_by_id(db=db, transcript_id=transcript_id, meeting_id=meeting.id)

    if not transcript or not os.path.exists(transcript.storage_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcript file not found on server.",
        )

    return FileResponse(
        path=transcript.storage_path,
        filename=transcript.original_filename,
        media_type="application/octet-stream",
    )
