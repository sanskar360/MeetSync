import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def parse_timestamp_seconds(ts_str: str) -> float | None:
    """
    Parses timestamp string (HH:MM:SS.mmm or MM:SS.mmm or SRT comma format) to seconds.
    """
    ts_str = ts_str.strip().replace(",", ".")
    parts = ts_str.split(":")
    try:
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        return float(ts_str)
    except ValueError:
        return None


def _extract_speakers_from_lines(lines: list[str]) -> tuple[list[str], str]:
    """
    Extracts speaker labels formatted as 'Speaker Name: Text' or '[Speaker Name] Text'.
    Returns (distinct_speakers, full_text).
    """
    speakers = set()
    cleaned_text_lines = []

    speaker_colon_regex = re.compile(r"^([A-Z][a-zA-Z0-9\s._'-]{1,30}):\s+(.+)$")
    speaker_bracket_regex = re.compile(r"^\[([A-Z][a-zA-Z0-9\s._'-]{1,30})\]\s*(.+)$")

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        m_colon = speaker_colon_regex.match(stripped)
        m_bracket = speaker_bracket_regex.match(stripped)

        if m_colon:
            speaker = m_colon.group(1).strip()
            content = m_colon.group(2).strip()
            speakers.add(speaker)
            cleaned_text_lines.append(f"{speaker}: {content}")
        elif m_bracket:
            speaker = m_bracket.group(1).strip()
            content = m_bracket.group(2).strip()
            speakers.add(speaker)
            cleaned_text_lines.append(f"{speaker}: {content}")
        else:
            cleaned_text_lines.append(stripped)

    return sorted(list(speakers)), "\n".join(cleaned_text_lines)


def parse_vtt(content: str) -> dict[str, Any]:
    lines = content.splitlines()
    cues = []
    speakers = set()
    text_lines = []

    timestamp_regex = re.compile(
        r"(\d{1,2}:(?:\d{2}:)?\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:(?:\d{2}:)?\d{2}[.,]\d{3})"
    )
    v_tag_regex = re.compile(r"<v\s+([^>]+)>(.*)</v>")

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = timestamp_regex.search(line)
        if m:
            start_sec = parse_timestamp_seconds(m.group(1))
            end_sec = parse_timestamp_seconds(m.group(2))
            i += 1
            cue_text_parts = []
            cue_speaker = None

            while i < len(lines) and lines[i].strip():
                sub_line = lines[i].strip()
                v_match = v_tag_regex.match(sub_line)
                if v_match:
                    cue_speaker = v_match.group(1).strip()
                    cue_text_parts.append(v_match.group(2).strip())
                else:
                    cue_text_parts.append(sub_line)
                i += 1

            cue_text = " ".join(cue_text_parts)
            if not cue_speaker:
                colon_match = re.match(r"^([A-Z][a-zA-Z0-9\s._'-]{1,30}):\s+(.+)$", cue_text)
                if colon_match:
                    cue_speaker = colon_match.group(1).strip()
                    cue_text = colon_match.group(2).strip()

            if cue_speaker:
                speakers.add(cue_speaker)

            cues.append({
                "start": start_sec,
                "end": end_sec,
                "speaker": cue_speaker,
                "text": cue_text,
            })
            text_lines.append(f"{cue_speaker}: {cue_text}" if cue_speaker else cue_text)
        else:
            i += 1

    full_text = "\n".join(text_lines)
    words = re.findall(r"\w+", full_text)

    return {
        "text": full_text,
        "cues": cues,
        "speakers": sorted(list(speakers)),
        "word_count": len(words),
        "cue_count": len(cues),
    }


def parse_srt(content: str) -> dict[str, Any]:
    lines = content.splitlines()
    cues = []
    speakers = set()
    text_lines = []

    timestamp_regex = re.compile(
        r"(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})"
    )

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = timestamp_regex.search(line)
        if m:
            start_sec = parse_timestamp_seconds(m.group(1))
            end_sec = parse_timestamp_seconds(m.group(2))
            i += 1
            cue_text_parts = []
            while i < len(lines) and lines[i].strip():
                cue_text_parts.append(lines[i].strip())
                i += 1

            cue_text = " ".join(cue_text_parts)
            cue_speaker = None
            colon_match = re.match(r"^([A-Z][a-zA-Z0-9\s._'-]{1,30}):\s+(.+)$", cue_text)
            if colon_match:
                cue_speaker = colon_match.group(1).strip()
                cue_text = colon_match.group(2).strip()

            if cue_speaker:
                speakers.add(cue_speaker)

            cues.append({
                "start": start_sec,
                "end": end_sec,
                "speaker": cue_speaker,
                "text": cue_text,
            })
            text_lines.append(f"{cue_speaker}: {cue_text}" if cue_speaker else cue_text)
        else:
            i += 1

    full_text = "\n".join(text_lines)
    words = re.findall(r"\w+", full_text)

    return {
        "text": full_text,
        "cues": cues,
        "speakers": sorted(list(speakers)),
        "word_count": len(words),
        "cue_count": len(cues),
    }


def parse_json_transcript(content: str) -> dict[str, Any]:
    data = json.loads(content)
    cues = []
    speakers = set()
    text_parts = []

    # Format 1: list of segments/cues
    segments = []
    if isinstance(data, list):
        segments = data
    elif isinstance(data, dict):
        for key in ("segments", "cues", "transcript", "transcripts", "messages"):
            if key in data and isinstance(data[key], list):
                segments = data[key]
                break

    if segments:
        for seg in segments:
            if isinstance(seg, dict):
                speaker = seg.get("speaker") or seg.get("speaker_name") or seg.get("name")
                text = seg.get("text") or seg.get("content") or ""
                start = seg.get("start") or seg.get("start_time")
                end = seg.get("end") or seg.get("end_time")

                if speaker:
                    speakers.add(speaker)
                cues.append({
                    "start": float(start) if start is not None else None,
                    "end": float(end) if end is not None else None,
                    "speaker": speaker,
                    "text": text,
                })
                text_parts.append(f"{speaker}: {text}" if speaker else text)

        full_text = "\n".join(text_parts)
    elif isinstance(data, dict) and "text" in data:
        full_text = str(data["text"])
    else:
        full_text = json.dumps(data, indent=2)

    words = re.findall(r"\w+", full_text)
    return {
        "text": full_text,
        "cues": cues,
        "speakers": sorted(list(speakers)),
        "word_count": len(words),
        "cue_count": len(cues),
    }


def parse_transcript_file(file_path: str, ext: str) -> dict[str, Any]:
    """
    Parses a transcript file based on its extension.
    Returns:
    {
        "text": str,
        "cues": list,
        "speakers": list[str],
        "word_count": int,
        "cue_count": int,
        "format": str
    }
    """
    p = Path(file_path)
    ext = ext.lower().strip()

    # Read bytes and decode
    raw_bytes = p.read_bytes()
    try:
        content = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        content = raw_bytes.decode("latin-1")

    if ext == ".vtt":
        res = parse_vtt(content)
    elif ext == ".srt":
        res = parse_srt(content)
    elif ext == ".json":
        res = parse_json_transcript(content)
    elif ext in (".txt", ".md"):
        speakers, full_text = _extract_speakers_from_lines(content.splitlines())
        words = re.findall(r"\w+", full_text)
        res = {
            "text": full_text,
            "cues": [],
            "speakers": speakers,
            "word_count": len(words),
            "cue_count": 0,
        }
    else:
        # Fallback text extractor
        speakers, full_text = _extract_speakers_from_lines(content.splitlines())
        words = re.findall(r"\w+", full_text)
        res = {
            "text": full_text,
            "cues": [],
            "speakers": speakers,
            "word_count": len(words),
            "cue_count": 0,
        }

    res["format"] = ext
    return res
