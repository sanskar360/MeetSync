import { http } from './http';

/**
 * Transcripts API Service
 * - Connects directly to FastAPI backend transcript endpoints
 * - Strictly meeting-scoped: /api/meetings/{meeting_id}/transcripts/...
 * - Role-governed: Uploading transcripts is strictly restricted to note_taker
 * - Transcripts are immutable: no delete endpoint
 */

/**
 * Upload a transcript file for a meeting.
 * Strictly restricted to the Note Taker of this meeting.
 */
export async function uploadTranscript(meetingId, file) {
  const formData = new FormData();
  formData.append('file', file);

  return http.upload(`/api/meetings/${meetingId}/transcripts`, formData);
}

/**
 * Lists metadata and validation reports for all transcripts in a meeting.
 * Available to all authenticated meeting members.
 * Unwraps TranscriptListResponse envelope ({ meeting_id, transcripts, count }).
 */
export async function getMeetingTranscripts(meetingId) {
  const res = await http.get(`/api/meetings/${meetingId}/transcripts`);
  return Array.isArray(res) ? res : (res?.transcripts || []);
}

/**
 * Retrieves metadata and validation report for a single transcript.
 */
export async function getTranscriptById(meetingId, transcriptId) {
  const effectiveTid = transcriptId || meetingId;
  const effectiveMeetingId = transcriptId ? meetingId : null;

  const url = effectiveMeetingId
    ? `/api/meetings/${effectiveMeetingId}/transcripts/${effectiveTid}`
    : `/transcripts/${effectiveTid}`;

  return http.get(url);
}

/**
 * Fetches extracted transcript text.
 * Dedicated endpoint returning TranscriptTextResponse ({ id, meeting_id, content_text, word_count }).
 * Unwraps and returns the text string directly.
 */
export async function getTranscriptText(meetingId, transcriptId) {
  const effectiveTid = transcriptId || meetingId;
  const effectiveMeetingId = transcriptId ? meetingId : null;

  const url = effectiveMeetingId
    ? `/api/meetings/${effectiveMeetingId}/transcripts/${effectiveTid}/text`
    : `/transcripts/${effectiveTid}/text`;

  const res = await http.get(url);
  if (res && typeof res === 'object' && 'content_text' in res) {
    return res.content_text;
  }
  return res || '';
}

/**
 * Streams the raw transcript file from the server and initiates a browser download.
 * Authorized to all authenticated meeting members.
 */
export async function downloadTranscriptFile(meetingId, transcriptId, filename = 'transcript.txt') {
  let effectiveMeetingId = meetingId;
  let effectiveTid = transcriptId;
  let effectiveFilename = filename;

  if (typeof transcriptId === 'string' && transcriptId.includes('.') && filename === 'transcript.txt') {
    effectiveFilename = transcriptId;
    effectiveTid = meetingId;
    effectiveMeetingId = null;
  } else if (!transcriptId) {
    effectiveTid = meetingId;
    effectiveMeetingId = null;
  }

  const url = effectiveMeetingId
    ? `/api/meetings/${effectiveMeetingId}/transcripts/${effectiveTid}/file`
    : `/transcripts/${effectiveTid}/file`;

  const blob = await http.get(url);

  if (typeof window !== 'undefined' && blob) {
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = effectiveFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }
}
