import { http } from './http';

/**
 * Notes API Service
 * - Connects directly to FastAPI backend notes endpoints
 * - Strictly meeting-scoped: /api/meetings/{meeting_id}/notes/...
 * - Role-governed: Note authoring (create, update, delete) restricted to note_taker
 */

/**
 * Retrieves all notes for a specific meeting.
 * Accessible to all authenticated members of the meeting.
 */
export async function getMeetingNotes(meetingId) {
  const res = await http.get(`/api/meetings/${meetingId}/notes`);
  return Array.isArray(res) ? res : (res?.notes || []);
}

/**
 * Creates a new note for a meeting with structured action items.
 * Strictly restricted to the designated Note Taker for this meeting.
 */
export async function createMeetingNote(meetingId, noteData) {
  return http.post(`/api/meetings/${meetingId}/notes`, noteData);
}

/**
 * Retrieves a single note by ID within a meeting.
 */
export async function getNoteById(meetingId, noteId) {
  const effectiveNoteId = noteId || meetingId;
  const effectiveMeetingId = noteId ? meetingId : null;

  if (effectiveMeetingId) {
    return http.get(`/api/meetings/${effectiveMeetingId}/notes/${effectiveNoteId}`);
  }
  return http.get(`/notes/${effectiveNoteId}`);
}

/**
 * Updates a meeting note.
 * Strictly restricted to the note's author (who holds the Note Taker role).
 * Supports both updateNote(meetingId, noteId, updateData) and updateNote(noteId, updateData).
 */
export async function updateNote(meetingId, noteId, updateData) {
  let mId = meetingId;
  let nId = noteId;
  let data = updateData;

  if (updateData === undefined && typeof noteId === 'object' && noteId !== null) {
    mId = null;
    nId = meetingId;
    data = noteId;
  }

  if (mId) {
    return http.patch(`/api/meetings/${mId}/notes/${nId}`, data);
  }
  return http.patch(`/notes/${nId}`, data);
}

/**
 * Deletes a meeting note.
 * Strictly restricted to the note's author (who holds the Note Taker role).
 * Supports both deleteNote(meetingId, noteId) and deleteNote(noteId).
 */
export async function deleteNote(meetingId, noteId) {
  const mId = noteId ? meetingId : null;
  const nId = noteId || meetingId;

  if (mId) {
    return http.delete(`/api/meetings/${mId}/notes/${nId}`);
  }
  return http.delete(`/notes/${nId}`);
}
