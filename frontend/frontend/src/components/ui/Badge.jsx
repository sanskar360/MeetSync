import React from 'react';
import { cn } from '@/lib/utils';
import { ROLES } from '@/lib/roles';
import { TRANSCRIPT_STATUS } from '@/types/transcript';
import { Crown, PenTool, Search, UserCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

/**
 * Reusable Badge component with specialized variants for Roles and Transcript Statuses.
 */
export function Badge({
  children,
  variant = 'neutral',
  role = null,
  status = null,
  responseStatus = null,
  size = 'md',
  className = '',
  icon = null,
  ...props
}) {
  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 rounded-md font-medium gap-1',
    md: 'text-xs px-2.5 py-1 rounded-lg font-medium gap-1.5',
    lg: 'text-sm px-3 py-1.5 rounded-xl font-medium gap-2',
  };

  // 1. Role-specific badges
  if (role) {
    switch (role) {
      case ROLES.AGENDA_OWNER:
        return (
          <span
            className={cn(
              'inline-flex items-center bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-xs',
              sizes[size],
              className
            )}
            {...props}
          >
            <Crown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>{children || 'Agenda Owner'}</span>
          </span>
        );
      case ROLES.NOTE_TAKER:
        return (
          <span
            className={cn(
              'inline-flex items-center bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-xs',
              sizes[size],
              className
            )}
            {...props}
          >
            <PenTool className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{children || 'Note Taker'}</span>
          </span>
        );
      case ROLES.PERSONAL_ASSISTANT:
        return (
          <span
            className={cn(
              'inline-flex items-center bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-xs',
              sizes[size],
              className
            )}
            {...props}
          >
            <Search className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>{children || 'Personal Assistant'}</span>
          </span>
        );
      case ROLES.PARTICIPANT:
      default:
        return (
          <span
            className={cn(
              'inline-flex items-center bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-xs',
              sizes[size],
              className
            )}
            {...props}
          >
            <UserCheck className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>{children || 'Participant'}</span>
          </span>
        );
    }
  }

  // 2. Transcript Status badges
  if (status) {
    switch (status) {
      case TRANSCRIPT_STATUS.ACCEPTED:
        return (
          <span
            className={cn(
              'inline-flex items-center bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
              sizes[size],
              className
            )}
            {...props}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{children || 'Accepted'}</span>
          </span>
        );
      case TRANSCRIPT_STATUS.NEEDS_REVIEW:
        return (
          <span
            className={cn(
              'inline-flex items-center bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
              sizes[size],
              className
            )}
            title="Transcription completed with low-confidence segments. Needs review, not an upload failure."
            {...props}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>{children || 'Needs Review'}</span>
          </span>
        );
      case TRANSCRIPT_STATUS.REJECTED:
        return (
          <span
            className={cn(
              'inline-flex items-center bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
              sizes[size],
              className
            )}
            {...props}
          >
            <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>{children || 'Rejected'}</span>
          </span>
        );
      default:
        break;
    }
  }

  // 3. Participant Response Status Badges
  if (responseStatus) {
    const normalized = String(responseStatus).toLowerCase();
    switch (normalized) {
      case 'accepted':
        return (
          <span
            className={cn(
              'inline-flex items-center bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium px-2 py-0.5 rounded-md gap-1',
              className
            )}
            {...props}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{children || 'Accepted'}</span>
          </span>
        );
      case 'tentative':
        return (
          <span
            className={cn(
              'inline-flex items-center bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-medium px-2 py-0.5 rounded-md gap-1',
              className
            )}
            {...props}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>{children || 'Tentative'}</span>
          </span>
        );
      case 'needs_action':
      default:
        return (
          <span
            className={cn(
              'inline-flex items-center bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[11px] font-medium px-2 py-0.5 rounded-md gap-1',
              className
            )}
            {...props}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>{children || 'Invited'}</span>
          </span>
        );
    }
  }

  // 4. Generic Variants
  const variants = {
    primary: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    warning: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    outline: 'bg-transparent text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
  };

  return (
    <span
      className={cn('inline-flex items-center', variants[variant], sizes[size], className)}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
