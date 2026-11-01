import { useQuery } from '@tanstack/react-query';
import { fetchAllMeetings } from '@/api/meetings';
import { useAuth } from '@/features/auth/AuthContext';

/**
 * Hook to determine if the currently authenticated user holds the 'note_taker'
 * role in any meeting across their schedule.
 *
 * Per authority rules: only Note Takers have authority to access the
 * Personal Assistant search and archive.
 */
export function useUserRoles() {
  const { user } = useAuth();
  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ['meetings', 'all'],
    queryFn: () => fetchAllMeetings({ limit: 50 }),
    staleTime: 30 * 1000,
  });

  const roles = new Set();
  if (user && Array.isArray(meetings)) {
    meetings.forEach((m) => {
      const directRole = m.user_role || m.role;
      if (directRole) roles.add(directRole);
      if (Array.isArray(m.participants)) {
        m.participants.forEach((p) => {
          if (
            (p.user_id === user.id || (user.email && p.email?.toLowerCase() === user.email.toLowerCase())) &&
            p.role
          ) {
            roles.add(p.role);
          }
        });
      }
    });
  }

  const isNoteTaker = roles.has('note_taker');
  const isPersonalAssistant = roles.has('personal_assistant');
  const isAgendaOwner = roles.has('agenda_owner') || roles.has('organizer');
  const canSearch = Boolean(user);

  return { isNoteTaker, isPersonalAssistant, isAgendaOwner, canSearch, isLoading, meetings };
}

export function useIsNoteTaker() {
  return useUserRoles();
}

export function useIsPersonalAssistant() {
  const { isPersonalAssistant, isLoading, meetings } = useUserRoles();
  return { isPersonalAssistant, isLoading, meetings };
}
