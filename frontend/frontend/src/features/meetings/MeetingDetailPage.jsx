import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMeetingDetails, updateParticipantRole } from '@/api/meetings';
import { useAuth } from '@/features/auth/AuthContext';
import { getMyRole, getCapabilities, ROLES, ROLE_LABELS } from '@/lib/roles';
import { formatLocalDate, formatLocalTime } from '@/lib/date';
import { getMeetingStatusInfo } from '@/lib/meetingStatus';
import { getInitials } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardEyebrow, CardContent, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { NotesSection } from '@/features/notes/NotesSection';
import { TranscriptsSection } from '@/features/transcripts/TranscriptsSection';
import { AddParticipantModal } from '@/features/meetings/AddParticipantModal';
import { AssignRoleModal } from '@/features/meetings/AssignRoleModal';
import {
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Users,
  FileText,
  ArrowLeft,
  ShieldCheck,
  Upload,
  UserPlus,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

export function MeetingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Modal states
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);
  const [assignRoleConfig, setAssignRoleConfig] = useState({
    isOpen: false,
    targetRole: ROLES.NOTE_TAKER,
  });

  // Query meeting details using GET /api/meetings/{id}/details
  const {
    data: meeting,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['meeting', id, 'details'],
    queryFn: () => getMeetingDetails(id),
    enabled: Boolean(id),
    retry: false,
  });

  // Determine current user's role and capabilities from participants
  const participants = meeting?.participants || [];

  const myRole = useMemo(() => {
    return meeting?.user_role || getMyRole(participants, user);
  }, [meeting?.user_role, participants, user]);

  const capabilities = useMemo(() => {
    return getCapabilities(myRole);
  }, [myRole]);

  // Current designated role holders
  const currentNoteTaker = useMemo(
    () => participants.find((p) => p.role === ROLES.NOTE_TAKER),
    [participants]
  );
  const currentPersonalAssistant = useMemo(
    () => participants.find((p) => p.role === ROLES.PERSONAL_ASSISTANT),
    [participants]
  );

  // Derive meeting timing status
  const meetingStatusInfo = useMemo(() => {
    return meeting ? getMeetingStatusInfo(meeting) : null;
  }, [meeting]);

  const handleOpenAssignModal = (targetRole) => {
    setAssignRoleConfig({
      isOpen: true,
      targetRole,
    });
  };

  // Mutation for updating participant roles with optimistic update & rollback
  const updateRoleMutation = useMutation({
    mutationFn: ({ participantId, newRole }) =>
      updateParticipantRole(id, participantId, newRole),
    onMutate: async ({ participantId, newRole }) => {
      await queryClient.cancelQueries({ queryKey: ['meeting', id, 'details'] });
      const previousMeeting = queryClient.getQueryData(['meeting', id, 'details']);

      if (previousMeeting) {
        queryClient.setQueryData(['meeting', id, 'details'], {
          ...previousMeeting,
          participants: previousMeeting.participants?.map((p) => {
            // Demote other holder if newRole is note_taker or personal_assistant
            if (
              [ROLES.NOTE_TAKER, ROLES.PERSONAL_ASSISTANT].includes(newRole) &&
              p.role === newRole &&
              p.id !== participantId &&
              p.user_id !== participantId
            ) {
              return { ...p, role: ROLES.PARTICIPANT };
            }
            const matches = p.id === participantId || p.user_id === participantId;
            return matches ? { ...p, role: newRole } : p;
          }),
        });
      }

      return { previousMeeting };
    },
    onError: (err, newVariables, context) => {
      if (context?.previousMeeting) {
        queryClient.setQueryData(['meeting', id, 'details'], context.previousMeeting);
      }
      toast.error(err.message || 'Failed to update participant role. Changes were rolled back.');
    },
    onSuccess: (updatedParticipant) => {
      const role = updatedParticipant?.role;
      toast.success(
        `Role updated to ${ROLE_LABELS[role] || role || 'new role'}`
      );
      setAssignRoleConfig((prev) => ({ ...prev, isOpen: false }));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', id, 'details'] });
    },
  });

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <Skeleton className="h-6 w-32 rounded-lg" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  // 2. Error State (403 / 404 from server)
  if (isError) {
    const isForbidden = error?.status === 403;
    const isNotFound = error?.status === 404;

    return (
      <div className="py-8">
        <ErrorState
          status={error?.status || 404}
          title={isForbidden ? 'Access Denied' : isNotFound ? 'Meeting Not Found' : 'Error Loading Meeting'}
          message={
            error?.message ||
            (isForbidden
              ? 'You are not authorized to view this meeting.'
              : 'The requested meeting could not be found.')
          }
          showBackHome={true}
          onRetry={isForbidden ? null : refetch}
        />
      </div>
    );
  }

  // 3. Meeting not found fallback
  if (!meeting) {
    return (
      <div className="py-8">
        <ErrorState
          status={404}
          title="Meeting Not Found"
          message="This meeting does not exist or has been removed."
          showBackHome={true}
        />
      </div>
    );
  }

  // 4. Non-member State
  if (!capabilities.isMember || !myRole) {
    return (
      <div className="py-8">
        <ErrorState
          status={403}
          title="Access Denied"
          message="You are not a registered participant of this meeting. Private agendas, participant rosters, notes, and transcripts are strictly restricted to members."
          showBackHome={true}
          onRetry={null}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Back Navigation to Dashboard */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-surface-subtle px-3 py-1.5 rounded-xl border border-border transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Meeting Header Card */}
      <Card className="shadow-card border-border">
        <CardHeader className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Meeting Overview
            </span>

            {/* Badges: Meeting Status & Your Role */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {(() => {
                const statusInfo = getMeetingStatusInfo(meeting);
                const isLive = statusInfo.label === 'In Progress';
                return (
                  <span
                    className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl border flex items-center gap-1.5 ${
                      isLive
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : statusInfo.variant === 'primary'
                        ? 'bg-primary-50 dark:bg-primary-950/60 text-primary border-primary/20'
                        : statusInfo.variant === 'warning'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-500/20'
                        : statusInfo.variant === 'danger'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    {statusInfo.label}
                  </span>
                );
              })()}

              <div className="flex items-center gap-2 bg-surface-subtle/80 px-3 py-1.5 rounded-xl border border-border">
                <span className="text-xs font-semibold text-content-secondary">
                  Your role:
                </span>
                <Badge role={myRole} size="sm" />
              </div>
            </div>
          </div>

          <CardTitle as="h1" className="text-2xl sm:text-3xl font-extrabold text-content-primary tracking-tight">
            {meeting.title}
          </CardTitle>

          {meeting.description && (
            <CardDescription className="text-sm sm:text-base text-content-secondary mt-2 max-w-3xl leading-relaxed">
              {meeting.description}
            </CardDescription>
          )}

          {/* Date / Time / Meet Link row */}
          <div className="mt-6 flex flex-wrap items-center gap-4 sm:gap-6 text-xs font-medium text-content-secondary border-t border-border-subtle pt-4">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" />
              {formatLocalDate(meeting.start_time, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>

            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" />
              {formatLocalTime(meeting.start_time)} – {formatLocalTime(meeting.end_time)}
            </span>

            {meeting.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-content-muted" />
                {meeting.location}
              </span>
            )}

            {/* Meet Link Button if present */}
            {(meeting.meet_url || meeting.meeting_url) && (
              <a
                href={meeting.meet_url || meeting.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-primary hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-semibold text-xs border border-primary/20 transition-colors shadow-2xs"
              >
                <span>Join Video Call</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Role Capabilities Banner */}
      <div className="p-4 rounded-2xl bg-surface-card border border-border flex items-start gap-3 shadow-2xs text-xs text-content-secondary">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-content-primary block">
            Role Permission Summary ({ROLE_LABELS[myRole] || myRole}):
          </span>
          {capabilities.canManageRoles && (
            <p>
              As <strong>Agenda Owner</strong>, you have governance over this meeting. You can designate one <strong>Note Taker</strong>, one <strong>Personal Assistant</strong>, and add participants.
            </p>
          )}
          {capabilities.canWriteNotes && (
            <p>
              As <strong>Note Taker</strong>, you are authorized to draft collaborative notes, manage action items, and upload audio transcripts.
            </p>
          )}
          {myRole === ROLES.PERSONAL_ASSISTANT && (
            <p>
              As <strong>Personal Assistant</strong>, you have read-only access to meeting details and can query historical items in the Assistant Archive.
            </p>
          )}
          {myRole === ROLES.PARTICIPANT && (
            <p>
              As <strong>Participant</strong>, you have read-only access to meeting materials and verified notes.
            </p>
          )}
        </div>
      </div>

      {/* SECTION 1: PARTICIPANTS */}
      <Card className="shadow-card border-border">
        <CardHeader className="border-b border-border-subtle pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardEyebrow>ROSTER</CardEyebrow>
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <span>Participants ({participants.length})</span>
              </CardTitle>
            </div>

            {/* Role Assignment & Add Participant Actions (Agenda Owner Only) */}
            {capabilities.canManageRoles && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<FileText className="w-3.5 h-3.5 text-primary" />}
                  onClick={() => handleOpenAssignModal(ROLES.NOTE_TAKER)}
                >
                  Assign Note Taker
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Sparkles className="w-3.5 h-3.5 text-indigo-500" />}
                  onClick={() => handleOpenAssignModal(ROLES.PERSONAL_ASSISTANT)}
                >
                  Assign Personal Assistant
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<UserPlus className="w-4 h-4" />}
                  onClick={() => setIsAddParticipantOpen(true)}
                >
                  Add Participant
                </Button>
              </div>
            )}
          </div>

          {/* Role Status Summary Row for Agenda Owner */}
          {capabilities.canManageRoles && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-surface-subtle/70 border border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted block">
                      Designated Note Taker
                    </span>
                    <span className="text-xs font-semibold text-content-primary truncate block">
                      {currentNoteTaker ? (currentNoteTaker.full_name || currentNoteTaker.email) : 'None designated'}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary font-semibold hover:bg-surface-card shrink-0"
                  onClick={() => handleOpenAssignModal(ROLES.NOTE_TAKER)}
                >
                  {currentNoteTaker ? 'Change' : 'Assign'}
                </Button>
              </div>

              <div className="p-3 rounded-xl bg-surface-subtle/70 border border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted block">
                      Designated Personal Assistant
                    </span>
                    <span className="text-xs font-semibold text-content-primary truncate block">
                      {currentPersonalAssistant ? (currentPersonalAssistant.full_name || currentPersonalAssistant.email) : 'None designated'}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-surface-card shrink-0"
                  onClick={() => handleOpenAssignModal(ROLES.PERSONAL_ASSISTANT)}
                >
                  {currentPersonalAssistant ? 'Change' : 'Assign'}
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-content-secondary mt-1">
            Confirmed meeting attendees and their assigned workspace roles.
          </p>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          {participants.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6 text-slate-400" />}
              title="No participants listed"
              description="No attendee records are currently associated with this meeting."
              className="py-6 border-dashed"
            />
          ) : (
            <div className="divide-y divide-border-subtle">
              {participants.map((participant) => {
                const isSelf =
                  participant.user_id === user?.id ||
                  participant.id === user?.id ||
                  participant.email === user?.email;

                const isRegistered = Boolean(
                  participant.is_registered || participant.user_id
                );

                return (
                  <div
                    key={participant.id || participant.user_id || participant.email}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0"
                  >
                    {/* Avatar, Name, Email, Registration Flag */}
                    <div className="flex items-center gap-3">
                      {participant.avatar_url ? (
                        <img
                          src={participant.avatar_url}
                          alt={participant.full_name || 'Participant'}
                          className="w-10 h-10 rounded-full object-cover border border-border shadow-2xs shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 font-bold text-xs flex items-center justify-center border border-primary/20 shrink-0">
                          {getInitials(participant.full_name || participant.email)}
                        </div>
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-content-primary">
                            {participant.full_name || participant.email}
                          </span>
                          {isSelf && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-primary-50 dark:bg-primary-950 text-primary border border-primary/20">
                              You
                            </span>
                          )}

                          {/* Flag for users not registered on MeetSync */}
                          {!isRegistered && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800/80 px-2 py-0.5 rounded-md">
                              <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span>Not registered on MeetSync</span>
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-content-muted block mt-0.5">
                          {participant.email}
                        </span>
                      </div>
                    </div>

                    {/* Role Badge and Response Status */}
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <Badge
                        responseStatus={participant.response_status || 'accepted'}
                      />
                      <Badge role={participant.role} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2 & 3: NOTES & TRANSCRIPTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <NotesSection
          meetingId={id}
          userRole={myRole}
          canWriteNotes={capabilities.canWriteNotes}
        />

        <TranscriptsSection
          meetingId={id}
          userRole={myRole}
          canUploadTranscript={capabilities.canUploadTranscript}
        />
      </div>

      {/* Add Participant Modal */}
      <AddParticipantModal
        meetingId={id}
        meeting={meeting}
        meetingStatusInfo={meetingStatusInfo}
        isOpen={isAddParticipantOpen}
        onClose={() => setIsAddParticipantOpen(false)}
      />

      {/* Assign Role Modal (Note Taker / Personal Assistant) */}
      <AssignRoleModal
        isOpen={assignRoleConfig.isOpen}
        onClose={() => setAssignRoleConfig((prev) => ({ ...prev, isOpen: false }))}
        targetRole={assignRoleConfig.targetRole}
        participants={participants}
        onAssign={({ participantId, newRole }) => {
          updateRoleMutation.mutate({ participantId, newRole });
        }}
        isPending={updateRoleMutation.isPending}
      />
    </div>
  );
}
