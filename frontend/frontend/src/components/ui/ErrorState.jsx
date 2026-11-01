import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, ShieldAlert, FileQuestion, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { useNavigate } from 'react-router-dom';

/**
 * Reusable ErrorState component.
 * Explicitly handles 403 "Access Denied", 404 "Not Found", and generic API errors.
 */
export function ErrorState({
  status = null,
  title = null,
  message = null,
  onRetry = null,
  showBackHome = true,
  className = '',
}) {
  const navigate = useNavigate();

  const isAccessDenied = status === 403 || status === '403';
  const isNotFound = status === 404 || status === '404';

  const displayTitle =
    title ||
    (isAccessDenied
      ? 'Access Denied'
      : isNotFound
      ? 'Meeting Not Found'
      : 'Something went wrong');

  const displayMessage =
    message ||
    (isAccessDenied
      ? 'You are not a participant in this meeting or do not have sufficient permissions to view its contents.'
      : isNotFound
      ? 'The requested meeting could not be found. It may have been removed or the link is invalid.'
      : 'An unexpected error occurred while loading this data. Please try again.');

  const icon = isAccessDenied ? (
    <ShieldAlert className="w-8 h-8 text-rose-500" />
  ) : isNotFound ? (
    <FileQuestion className="w-8 h-8 text-amber-500" />
  ) : (
    <AlertCircle className="w-8 h-8 text-rose-500" />
  );

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-surface-card border border-border rounded-2xl shadow-card max-w-lg mx-auto my-8',
        className
      )}
    >
      <div
        className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border',
          isAccessDenied
            ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900'
            : isNotFound
            ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900'
            : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900'
        )}
      >
        {icon}
      </div>

      {status && (
        <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 mb-2">
          HTTP {status}
        </span>
      )}

      <h3 className="text-lg sm:text-xl font-bold text-content-primary mb-2">
        {displayTitle}
      </h3>
      <p className="text-sm text-content-secondary max-w-md mb-6 leading-relaxed">
        {displayMessage}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {showBackHome && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate('/')}
          >
            Back to Dashboard
          </Button>
        )}

        {/* Per requirements: 403 -> show access message, do NOT retry */}
        {!isAccessDenied && onRetry && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<RefreshCw className="w-4 h-4" />}
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
