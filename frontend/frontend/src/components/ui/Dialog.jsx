import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

/**
 * Accessible Modal Dialog component.
 * Supports light dismiss (clicking backdrop) and platform dismiss (Escape key).
 */
export function Dialog({
  isOpen,
  onClose,
  children,
  maxWidth = 'max-w-lg',
  className = '',
}) {
  const dialogRef = useRef(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock document body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150"
    >
      {/* Backdrop with light dismiss */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative w-full bg-surface-card border border-border rounded-2xl shadow-floating overflow-hidden z-10 transform transition-all animate-in zoom-in-95 duration-150',
          maxWidth,
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children, onClose, className = '' }) {
  return (
    <div className={cn('p-6 pb-4 flex items-start justify-between border-b border-border-subtle', className)}>
      <div className="flex-1 pr-4">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-surface-subtle transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

export function DialogTitle({ children, className = '' }) {
  return (
    <h2 className={cn('text-lg font-bold text-content-primary tracking-tight', className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children, className = '' }) {
  return (
    <p className={cn('text-sm text-content-secondary mt-1', className)}>
      {children}
    </p>
  );
}

export function DialogContent({ children, className = '' }) {
  return (
    <div className={cn('p-6 space-y-4', className)}>
      {children}
    </div>
  );
}

export function DialogFooter({ children, className = '' }) {
  return (
    <div
      className={cn(
        'p-5 sm:p-6 pt-3 border-t border-border-subtle bg-surface-subtle/30 flex items-center justify-end gap-3',
        className
      )}
    >
      {children}
    </div>
  );
}
