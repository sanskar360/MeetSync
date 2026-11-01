/**
 * Role Definitions & Capabilities for MeetSync
 * Roles are PER MEETING, never global.
 * 
 * ROLE RULES (UI hints only; the server is the real authority):
 * - agenda_owner: view everything, manage participant roles (can set note_taker, personal_assistant, participant; NEVER agenda_owner).
 * - note_taker: create notes; edit/delete only own notes; manage action items; upload transcripts.
 * - personal_assistant: read-only on the meeting; has the search/archive view.
 * - participant: read-only for notes/transcripts the API allows.
 * - not a member / 403 / 404: show an "Access denied / not found" state, no data.
 */

export const ROLES = {
  AGENDA_OWNER: 'agenda_owner',
  NOTE_TAKER: 'note_taker',
  PERSONAL_ASSISTANT: 'personal_assistant',
  PARTICIPANT: 'participant',
};

export const ROLE_LABELS = {
  [ROLES.AGENDA_OWNER]: 'Agenda Owner',
  [ROLES.NOTE_TAKER]: 'Note Taker',
  [ROLES.PERSONAL_ASSISTANT]: 'Personal Assistant',
  [ROLES.PARTICIPANT]: 'Participant',
};

/**
 * Roles that an agenda_owner is allowed to assign to other participants.
 * NOTE: Agenda owners can NEVER assign agenda_owner role to others.
 */
export const ASSIGNABLE_ROLES = [
  ROLES.NOTE_TAKER,
  ROLES.PERSONAL_ASSISTANT,
  ROLES.PARTICIPANT,
];

/**
 * Find the current user's role from the meeting participants list.
 * Matches by user ID or email from /api/auth/me.
 * Returns null if the user is not a member of the meeting.
 * 
 * @param {Array} participants - List of meeting participants
 * @param {Object} user - Current user object from AuthContext (/api/auth/me)
 * @returns {string|null} One of ROLES or null if not a participant
 */
export function getMyRole(participants = [], user = null) {
  if (!user || !Array.isArray(participants) || participants.length === 0) {
    return null;
  }

  const normalizedUserId = user.id?.toLowerCase();
  const normalizedUserEmail = user.email?.toLowerCase();

  const match = participants.find((p) => {
    if (!p) return false;
    const pUserId = (p.user_id || p.id)?.toLowerCase();
    const pEmail = p.email?.toLowerCase();

    return (
      (normalizedUserId && pUserId === normalizedUserId) ||
      (normalizedUserEmail && pEmail === normalizedUserEmail)
    );
  });

  return match?.role || null;
}

/**
 * Maps a meeting role to its corresponding UI capabilities.
 * 
 * @param {string|null} role - The role string
 * @returns {Object} Capabilities map
 */
export function getCapabilities(role) {
  if (!role) {
    return {
      canManageRoles: false,
      canWriteNotes: false,
      canUploadTranscript: false,
      canViewNotes: false,
      canViewTranscripts: false,
      isMember: false,
    };
  }

  return {
    // agenda_owner: can manage participant roles (never agenda_owner)
    canManageRoles: role === ROLES.AGENDA_OWNER,

    // note_taker: create notes, edit/delete own notes, manage action items
    canWriteNotes: role === ROLES.NOTE_TAKER,

    // note_taker: upload transcripts
    canUploadTranscript: role === ROLES.NOTE_TAKER,

    // All registered meeting roles can view notes and transcripts allowed by API
    canViewNotes: [
      ROLES.AGENDA_OWNER,
      ROLES.NOTE_TAKER,
      ROLES.PERSONAL_ASSISTANT,
      ROLES.PARTICIPANT,
    ].includes(role),

    canViewTranscripts: [
      ROLES.AGENDA_OWNER,
      ROLES.NOTE_TAKER,
      ROLES.PERSONAL_ASSISTANT,
      ROLES.PARTICIPANT,
    ].includes(role),

    isMember: true,
  };
}
