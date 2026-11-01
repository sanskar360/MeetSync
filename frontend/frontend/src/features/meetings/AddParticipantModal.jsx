import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addParticipant } from '@/api/meetings';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/lib/roles';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { UserPlus, X, Mail, ShieldAlert } from 'lucide-react';

// Simple email regex for client-side pre-validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * AddParticipantModal
 *
 * A modal dialog allowing the Agenda Owner to add a new participant
 * to an upcoming or currently ongoing meeting.
 *
 * Props:
 *  - meetingId  {string}   UUID of the meeting
 *  - isOpen     {boolean}  Whether the modal is visible
 *  - onClose    {Function} Callback to close the modal
 */
export function AddParticipantModal({ meetingId, meeting, meetingStatusInfo, isOpen, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const emailRef = useRef(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('participant');
  const [emailError, setEmailError] = useState('');

  // Reset form state whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setRole('participant');
      setEmailError('');
      // Auto-focus the email field a tick after mount
      setTimeout(() => emailRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const addParticipantMutation = useMutation({
    mutationFn: () => addParticipant(meetingId, { email: email.trim().toLowerCase(), role }),

    onSuccess: (newParticipant) => {
      // Invalidate meeting details so the participants list refreshes
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId, 'details'] });
      toast.success(
        `${newParticipant.email} has been added as ${ROLE_LABELS[newParticipant.role] || newParticipant.role}.`
      );
      onClose();
    },

    onError: (err) => {
      // Surface server error message directly — it's always specific and user-friendly
      toast.error(err.message || 'Failed to add participant. Please try again.');
    },
  });

  // Client-side email validation before submission
  function validateEmail() {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Email address is required.');
      return false;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return false;
    }
    setEmailError('');
    return true;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validateEmail()) return;
    addParticipantMutation.mutate();
  }

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        // Close on backdrop click (not on the dialog itself)
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-participant-title"
    >
      {/* Dialog Panel */}
      <div className="relative w-full max-w-md bg-surface-card border border-border rounded-2xl shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2
                id="add-participant-title"
                className="text-base font-bold text-content-primary"
              >
                Add Participant
              </h2>
              <p className="text-[11px] text-content-muted mt-0.5">
                Invite someone to join this meeting
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close add participant dialog"
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-subtle transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 space-y-4">
            {/* Status & Info banner */}
            {meetingStatusInfo && !meetingStatusInfo.isUpcoming ? (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>
                  <strong>Meeting Ended:</strong> This meeting is marked as <strong>{meetingStatusInfo.label}</strong>. In accordance with system policy, participants can only be added to <strong>upcoming</strong> or <strong>ongoing</strong> meetings.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  Only <strong>registered MeetSync users</strong> can be added to <strong>upcoming</strong> or <strong>ongoing</strong> meetings.
                </span>
              </div>
            )}

            {/* Email Field */}
            <Input
              ref={emailRef}
              label="Email Address"
              type="email"
              placeholder="participant@example.com"
              helperText="Participant must have an existing MeetSync account"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError('');
              }}
              onBlur={validateEmail}
              error={emailError}
              leftIcon={<Mail className="w-4 h-4 text-content-muted" />}
              autoComplete="off"
              required
            />

            {/* Role Selector */}
            <Select
              label="Assign Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>

            {/* Role hint */}
            <p className="text-[11px] text-content-muted leading-relaxed">
              <strong>Note Taker</strong> – can write notes &amp; upload transcripts.{' '}
              <strong>Personal Assistant</strong> – read-only + archive search.{' '}
              <strong>Participant</strong> – read-only access.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2 border-t border-border-subtle">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={addParticipantMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={addParticipantMutation.isPending}
              leftIcon={<UserPlus className="w-4 h-4" />}
            >
              {addParticipantMutation.isPending ? 'Adding…' : 'Add Participant'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

