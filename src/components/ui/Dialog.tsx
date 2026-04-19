'use client';

import * as React from 'react';
import { cn } from './cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  /** Where to mount: centered dialog or right-side drawer */
  variant?: 'dialog' | 'drawer';
}

export function Dialog({ open, onClose, children, maxWidth = 'max-w-2xl', variant = 'dialog' }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  if (variant === 'drawer') {
    return (
      <div
        className="fixed inset-0 z-[var(--z-drawer)] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'fadeIn 150ms var(--ease-out)' }}
      >
        <div
          className={cn(
            'absolute top-0 right-0 h-full bg-[var(--surface)] border-l border-[var(--border)]',
            'w-full sm:w-[90%] md:w-[70%] lg:w-[55%] xl:max-w-3xl',
            'overflow-y-auto',
          )}
          onClick={(e) => e.stopPropagation()}
          style={{ animation: 'slideInRight 200ms var(--ease-out)' }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      style={{ animation: 'fadeIn 150ms var(--ease-out)' }}
    >
      <div
        className={cn(
          'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)]',
          'w-full max-h-[90vh] overflow-hidden flex flex-col shadow-[var(--shadow-lg)]',
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'pop 200ms var(--ease-out)' }}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ title, subtitle, onClose }: { title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--border)]">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">{title}</div>
        {subtitle && <div className="text-[12px] text-[var(--ink-muted)] mt-0.5">{subtitle}</div>}
      </div>
      <button
        onClick={onClose}
        className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-[20px] leading-none w-7 h-7 flex items-center justify-center rounded-[var(--radius)]"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}

export function DialogBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto p-4', className)} {...rest} />;
}

export function DialogFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 p-4 border-t border-[var(--border)]', className)} {...rest} />;
}
