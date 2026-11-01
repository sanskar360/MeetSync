/**
 * Computes meeting status by comparing with current time and activity state.
 *
 * Requirements:
 * 1. Only incoming meetings (start_time > now or in-progress) appear as upcoming.
 * 2. Meetings whose dates/times are expired but never took place have a distinct
 *    status ("Expired (Did Not Occur)" or "Cancelled") different from upcoming meetings.
 * 3. Meetings with uploaded transcripts or written notes are classified as "Completed".
 */
export function getMeetingStatusInfo(meeting, now = new Date()) {
  if (!meeting) {
    return {
      label: 'Unknown',
      variant: 'muted',
      isUpcoming: false,
      isExpired: false,
      description: 'Unknown meeting status',
    };
  }

  if (meeting.status === 'cancelled') {
    return {
      label: 'Cancelled',
      variant: 'danger',
      isUpcoming: false,
      isExpired: true,
      description: 'Event was cancelled in calendar',
    };
  }

  const startTime = new Date(meeting.start_time);
  const endTime = meeting.end_time
    ? new Date(meeting.end_time)
    : new Date(startTime.getTime() + 30 * 60000);

  // Incoming / upcoming
  if (startTime > now) {
    return {
      label: 'Upcoming',
      variant: 'primary',
      isUpcoming: true,
      isExpired: false,
      description: 'Incoming scheduled meeting',
    };
  }

  // Currently live
  if (startTime <= now && endTime >= now) {
    return {
      label: 'In Progress',
      variant: 'success',
      isUpcoming: true,
      isExpired: false,
      description: 'Meeting is taking place right now',
    };
  }

  // Meeting time has passed: Did it take place?
  const hasNotes = Array.isArray(meeting.notes) && meeting.notes.length > 0;
  const hasTranscripts = Array.isArray(meeting.transcripts) && meeting.transcripts.length > 0;
  const hasActivity = hasNotes || hasTranscripts || meeting.notes_count > 0 || meeting.transcripts_count > 0;

  if (hasActivity) {
    return {
      label: 'Completed',
      variant: 'success',
      isUpcoming: false,
      isExpired: false,
      description: 'Meeting concluded with recorded notes/transcripts',
    };
  }

  return {
    label: 'Expired',
    sublabel: 'Did Not Take Place',
    variant: 'warning',
    isUpcoming: false,
    isExpired: true,
    description: 'Scheduled time passed without logged session notes or recordings',
  };
}
