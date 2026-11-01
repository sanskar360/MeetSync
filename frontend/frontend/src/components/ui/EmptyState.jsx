import React from 'react';
import { cn } from '@/lib/utils';
import { FolderOpen } from 'lucide-react';
import { Button } from './Button';

/**
 * Reusable EmptyState component for empty lists, search results, or dates with no meetings.
 */
export function EmptyState({
  icon = <FolderOpen className="w-8 h-8 text-primary" />,
  title = 'No items found',
  description = 'There are no items to display right now.',
  actionLabel = null,
  onAction = null,
  actionButton = null,
  className = '',
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-surface-card/60 border border-border border-dashed rounded-2xl',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-950/60 border border-primary/20 flex items-center justify-center mb-4 text-primary">
        {icon}
      </div>
      <h3 className="text-base sm:text-lg font-bold text-content-primary mb-1">
        {title}
      </h3>
      <p className="text-sm text-content-secondary max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {actionButton ? (
        actionButton
      ) : actionLabel && onAction ? (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
