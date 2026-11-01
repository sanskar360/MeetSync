import { http } from './http';

/**
 * Search API Service
 * - Search query with date ranges and role filtering
 * - Past meetings archive for Personal Assistant view
 * - Scoped strictly to meetings where current user is an authorized member
 */

/**
 * Search meetings across titles, notes, and transcripts.
 */
export async function searchMeetings({
  q = '',
  start_date = '',
  end_date = '',
  role = '',
  page = 1,
  limit = 20,
} = {}) {
  const params = new URLSearchParams();
  if (q && typeof q === 'string' && q.trim()) params.set('q', q.trim());
  if (start_date && typeof start_date === 'string' && start_date.trim()) params.set('start_date', start_date.trim());
  if (end_date && typeof end_date === 'string' && end_date.trim()) params.set('end_date', end_date.trim());
  if (role && typeof role === 'string' && role.trim()) params.set('role', role.trim());
  params.set('page', String(page || 1));
  params.set('limit', String(limit || 20));

  return http.get(`/api/meetings/search?${params.toString()}`);
}

/**
 * Browse past meetings archive for the authenticated user.
 */
export async function getPastMeetings({ page = 1, limit = 20 } = {}) {
  return http.get(`/api/meetings/past?page=${page}&limit=${limit}`);
}
