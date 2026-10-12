import logging
from typing import Any

from app.core.config import settings
from app.models.meeting import Meeting

logger = logging.getLogger(__name__)


def validate_parsed_transcript(
    parsed: dict[str, Any],
    meeting: Meeting,
) -> dict[str, Any]:
    """
    Performs deterministic, rule-based validation on a parsed transcript.
    Treats speaker mismatches as warnings (never rejections).
    Validates timestamps only for subtitle formats (.srt, .vtt).
    """
    file_format = parsed.get("format", "").lower()
    word_count = parsed.get("word_count", 0)
    cues = parsed.get("cues", [])
    detected_speakers = parsed.get("speakers", [])

    warnings: list[str] = []
    details: dict[str, Any] = {
        "cue_count": len(cues),
        "word_count": word_count,
        "format": file_format,
    }

    status = "ACCEPTED"
    format_valid = True
    timestamp_match = True
    participant_mismatch = False

    # 1. Minimum Word Count Validation
    min_word_count = settings.TRANSCRIPT_MIN_WORD_COUNT
    if word_count == 0:
        return {
            "status": "REJECTED",
            "participant_mismatch": False,
            "timestamp_match": False,
            "format_valid": False,
            "detected_speakers": [],
            "warnings": ["The transcript file is empty or contains no readable text."],
            "word_count": 0,
            "details": details,
        }

    if word_count < min_word_count:
        warnings.append(
            f"Transcript contains only {word_count} words (below recommended threshold of {min_word_count})."
        )
        status = "NEEDS_REVIEW"

    # 2. Format-Specific Cue Validation
    if file_format in (".vtt", ".srt"):
        if len(cues) == 0:
            return {
                "status": "REJECTED",
                "participant_mismatch": False,
                "timestamp_match": False,
                "format_valid": False,
                "detected_speakers": [],
                "warnings": [f"Subtitle format '{file_format}' contains no valid timestamp cues."],
                "word_count": word_count,
                "details": details,
            }

        # Check timestamp continuity
        backwards_cues = [c for c in cues if c.get("start") is not None and c.get("end") is not None and c["start"] > c["end"]]
        if backwards_cues:
            warnings.append(f"Found {len(backwards_cues)} cue(s) where start time exceeds end time.")
            timestamp_match = False
            status = "NEEDS_REVIEW"

    # 3. Timestamp Span vs Meeting Duration
    if cues and meeting.start_time and meeting.end_time:
        valid_cues = [c for c in cues if c.get("end") is not None]
        if valid_cues:
            max_cue_time = max(c["end"] for c in valid_cues)
            meeting_duration_sec = (meeting.end_time - meeting.start_time).total_seconds()

            # If transcript duration exceeds meeting duration by more than 3x (e.g. 5 hour transcript for 30m meeting)
            if meeting_duration_sec > 0 and max_cue_time > (meeting_duration_sec * 3):
                warnings.append(
                    f"Transcript duration ({int(max_cue_time)}s) significantly exceeds meeting scheduled duration ({int(meeting_duration_sec)}s)."
                )
                timestamp_match = False
                status = "NEEDS_REVIEW"

    # 4. Soft Participant Matching (Non-blocking warning only)
    if detected_speakers and meeting.participants:
        # Collect participant tokens (emails, local parts, and known user names)
        known_tokens = set()
        for p in meeting.participants:
            known_tokens.add(p.email.lower())
            known_tokens.add(p.email.split("@")[0].lower())
            if p.user and p.user.name:
                known_tokens.add(p.user.name.lower())
                for part in p.user.name.lower().split():
                    known_tokens.add(part)

        unmatched_speakers = []
        for speaker in detected_speakers:
            s_clean = speaker.strip().lower()
            # Partial substring or token match
            matched = any(token in s_clean or s_clean in token for token in known_tokens if len(token) > 2)
            if not matched:
                unmatched_speakers.append(speaker)

        if unmatched_speakers:
            participant_mismatch = True
            warnings.append(
                f"Speakers {unmatched_speakers} did not match scheduled meeting attendees. This is common with phonetic transcription and does not invalidate the transcript."
            )
            # Downgrade to NEEDS_REVIEW only if previously ACCEPTED
            if status == "ACCEPTED":
                status = "NEEDS_REVIEW"

    return {
        "status": status,
        "participant_mismatch": participant_mismatch,
        "timestamp_match": timestamp_match,
        "format_valid": format_valid,
        "detected_speakers": detected_speakers,
        "warnings": warnings,
        "word_count": word_count,
        "details": details,
    }
