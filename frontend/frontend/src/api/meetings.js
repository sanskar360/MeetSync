import { http } from './http';

/**
 * Meetings API Service
 * - Connects directly to FastAPI backend meeting endpoints
 * - Handles meeting list, detail, participants, and role updates
 */

/**
 * Retrieves paginated list of meetings for the current user.
 * Returns list[MeetingSummaryResponse].
 */
export async function getMeetings({ page = 1, limit = 50 } = {}) {
  return http.get(`/api/meetings?page=${page}&limit=${limit}`);
}

/**
 * Fetches all meeting records for calendar view.
 */
export async function fetchAllMeetings({ limit = 50 } = {}) {
  const firstPage = await getMeetings({ page: 1, limit });
  const items = Array.isArray(firstPage) ? [...firstPage] : [...(firstPage.items || [])];
  const total = firstPage.total || items.length;

  if (items.length >= total || !firstPage.total) {
    return items;
  }

  const totalPages = Math.ceil(total / limit);
  const remainingPromises = [];
  for (let p = 2; p <= totalPages; p++) {
    remainingPromises.push(getMeetings({ page: p, limit }));
  }

  const remainingResults = await Promise.all(remainingPromises);
  for (const res of remainingResults) {
    const pageItems = Array.isArray(res) ? res : (res.items || []);
    items.push(...pageItems);
  }

  return items;
}

/**
 * Retrieves consolidated meeting details (participants, notes, transcripts, user_role).
 */
export async function getMeetingDetails(id) {
  return http.get(`/api/meetings/${id}/details`);
}

/**
 * Update a participant's role within a meeting.
 * Strictly restricted to agenda_owner. Can only assign note_taker, personal_assistant, participant.
 */
export async function updateParticipantRole(meetingId, participantId, role) {
  return http.patch(`/api/meetings/${meetingId}/participants/${participantId}/role`, { role });
}

/**
 * Add a new participant to a meeting.
 * Strictly restricted to agenda_owner.
 * Meeting must be upcoming or ongoing (not past/cancelled).
 *
 * @param {string} meetingId - UUID of the meeting
 * @param {{ email: string, role: string }} payload - Participant email and role
 * @returns {Promise<ParticipantResponse>} Newly created participant record
 */
export async function addParticipant(meetingId, { email, role = 'participant' }) {
  return http.post(`/api/meetings/${meetingId}/participants`, { email, role });
}

/**
 * Synchronizes user calendars and meetings directly with Google Calendar API.
 */
export async function syncCalendars() {
  return http.post('/api/calendars/sync');
}
