import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Card Component with large rounded corners, soft borders, and subtle shadow
 */
export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={cn(
        'bg-surface-card border border-border rounded-2xl shadow-card transition-all duration-200 overflow-hidden',
        hover && 'hover:shadow-soft hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }) {
  return (
    <div className={cn('p-5 sm:p-6 pb-3 sm:pb-4', className)} {...props}>
      {children}
    </div>
  );
}

export function CardEyebrow({ children, className = '', ...props }) {
  return (
    <span
      className={cn(
        'block text-[11px] font-semibold tracking-wider uppercase text-primary mb-1',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function CardTitle({ children, className = '', as = 'h3', ...props }) {
  const Component = as;
  return (
    <Component
      className={cn('text-lg sm:text-xl font-bold tracking-tight text-content-primary', className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardDescription({ children, className = '', ...props }) {
  return (
    <p
      className={cn('text-sm text-content-secondary mt-1 leading-relaxed', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({ children, className = '', ...props }) {
  return (
    <div className={cn('p-5 sm:p-6 pt-0', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', ...props }) {
  return (
    <div
      className={cn(
        'p-5 sm:p-6 pt-3 border-t border-border-subtle bg-surface-subtle/40 flex items-center justify-between',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
