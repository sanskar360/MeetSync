import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Basic Skeleton placeholder with pulse animation
 */
export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={cn(
        'animate-pulse bg-slate-200/80 dark:bg-slate-800/80 rounded-xl',
        className
      )}
      {...props}
    />
  );
}

/**
 * Skeleton for Card loading state
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={cn('p-6 bg-surface-card border border-border rounded-2xl space-y-4 shadow-card', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-6 w-20 rounded-lg" />
      </div>
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="pt-2 flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Skeleton for lists (notes, participants, transcripts)
 */
export function SkeletonList({ count = 3, className = '' }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="p-4 bg-surface-card border border-border rounded-xl flex items-center justify-between gap-4"
        >
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
