import React, { useState, useEffect } from 'react';
import { ASSIGNABLE_ROLES, ROLE_LABELS, ROLES } from '@/lib/roles';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getInitials } from '@/lib/utils';
import {
  FileText,
  Sparkles,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';

/**
 * AssignRoleModal
 *
 * Dedicated dialog allowing the Agenda Owner to designate:
 * - One Note Taker, OR
 * - One Personal Assistant
 *
 * Features & Validations:
 * - Displays all meeting participants in a searchable list.
 * - Flags users who are NOT registered on MeetSync.
 * - Enforces that unregistered attendees cannot be assigned to privileged roles.
 * - Prevents reassigning the Agenda Owner.
 * - Reassigning automatically demotes any previous holder to participant.
 */
export function AssignRoleModal({
  isOpen,
  onClose,
  targetRole, // 'note_taker' | 'personal_assistant'
  participants = [],
  onAssign,
  isPending = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState(null);

  const isNoteTaker = targetRole === ROLES.NOTE_TAKER;
  const roleTitle = isNoteTaker ? 'Assign Note Taker' : 'Assign Personal Assistant';
  const roleIcon = isNoteTaker ? (
    <FileText className="w-5 h-5 text-primary" />
  ) : (
    <Sparkles className="w-5 h-5 text-indigo-500" />
  );

  // Find currently assigned participant for this role
  const currentHolder = participants.find((p) => p.role === targetRole);

  // Reset search and selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedParticipantId(currentHolder?.id || null);
    }
  }, [isOpen, currentHolder]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter participants by search query
  const filteredParticipants = participants.filter((p) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const email = (p.email || '').toLowerCase();
    const name = (p.full_name || '').toLowerCase();
    return email.includes(q) || name.includes(q);
  });

  const handleConfirmAssignment = (participant) => {
    if (!participant) return;
    onAssign({
      participantId: participant.id || participant.user_id,
      newRole: targetRole,
      participantEmail: participant.email,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-role-title"
    >
      <div className="relative w-full max-w-lg bg-surface-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              {roleIcon}
            </div>
            <div>
              <h2 id="assign-role-title" className="text-base font-bold text-content-primary">
                {roleTitle}
              </h2>
              <p className="text-xs text-content-muted mt-0.5">
                {isNoteTaker
                  ? 'Authorized to draft notes, manage action items, and upload transcripts.'
                  : 'Authorized for cross-meeting query and past assistant archives.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-subtle transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informational Guidance Banner */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="p-3 rounded-xl bg-surface-subtle/80 border border-border text-xs text-content-secondary space-y-1">
            <div className="flex items-center gap-2 font-semibold text-content-primary">
              <UserCheck className="w-4 h-4 text-primary shrink-0" />
              <span>Single Role Assignment Policy</span>
            </div>
            <p className="leading-relaxed text-[11px] text-content-muted">
              Each meeting can have at most one designated {ROLE_LABELS[targetRole]}.
              Selecting a new participant will automatically update any previous holder back to participant.
              Only registered MeetSync users can be designated.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative mt-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search participant by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface-card border border-border rounded-xl text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>

        {/* Participant List (Scrollable) */}
        <div className="px-6 py-2 overflow-y-auto divide-y divide-border-subtle flex-1">
          {filteredParticipants.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">
              No participants match "{searchTerm}"
            </div>
          ) : (
            filteredParticipants.map((participant) => {
              const isAgendaOwner =
                participant.role === ROLES.AGENDA_OWNER ||
                participant.role === 'organizer';

              const isRegistered = Boolean(
                participant.is_registered || participant.user_id
              );

              const isCurrentHolder = participant.role === targetRole;

              // Unregistered users and Agenda Owners cannot be assigned
              const canBeAssigned = !isAgendaOwner && isRegistered;

              return (
                <div
                  key={participant.id || participant.email}
                  className={`py-3 flex items-center justify-between gap-3 transition-colors ${
                    isCurrentHolder ? 'bg-primary/5 -mx-2 px-2 rounded-xl' : ''
                  }`}
                >
                  {/* Left: Avatar + Identity + Flags */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 font-bold text-xs flex items-center justify-center border border-primary/20 shrink-0">
                      {getInitials(participant.full_name || participant.email)}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-content-primary truncate">
                          {participant.full_name || participant.email}
                        </span>

                        {/* Current Role Badge */}
                        <Badge role={participant.role} size="sm" />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
                        <span className="truncate">{participant.email}</span>

                        {/* Unregistered Flag */}
                        {!isRegistered && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800/80 px-2 py-0.5 rounded-md">
                            <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>Not registered on MeetSync</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Action or State */}
                  <div className="shrink-0 flex items-center gap-2">
                    {isCurrentHolder ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-xl border border-emerald-300 dark:border-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Assigned</span>
                      </span>
                    ) : isAgendaOwner ? (
                      <span
                        title="Agenda Owner cannot be assigned to another role."
                        className="text-[11px] text-content-muted italic px-2 py-1"
                      >
                        Agenda Owner
                      </span>
                    ) : !isRegistered ? (
                      <span
                        title="This participant has not created an account on MeetSync yet."
                        className="text-[11px] text-amber-600 dark:text-amber-400 font-medium px-2 py-1"
                      >
                        Cannot assign
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleConfirmAssignment(participant)}
                      >
                        Select
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-between shrink-0 bg-surface-subtle/30 rounded-b-2xl">
          <div className="text-[11px] text-content-muted">
            {currentHolder ? (
              <span>
                Current {ROLE_LABELS[targetRole]}:{' '}
                <strong className="text-content-primary">{currentHolder.email}</strong>
              </span>
            ) : (
              <span>No {ROLE_LABELS[targetRole]} currently designated.</span>
            )}
          </div>

          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

