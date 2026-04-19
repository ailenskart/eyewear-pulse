import * as React from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger';
type Size = 'xs' | 'sm' | 'md';

const TONE: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-2)] text-[var(--ink-muted)]',
  accent:  'bg-[var(--accent-soft)] text-[var(--accent)]',
  success: 'bg-[var(--success-soft)] text-[var(--success)]',
  warn:    'bg-[var(--warn-soft)] text-[var(--warn)]',
  danger:  'bg-[var(--danger-soft)] text-[var(--danger)]',
};

const SIZE: Record<Size, string> = {
  xs: 'h-4 px-1 text-[9px]',
  sm: 'h-5 px-1.5 text-[10px]',
  md: 'h-6 px-2 text-[11px]',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: Size;
}

export function Badge({ tone = 'neutral', size = 'sm', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded font-semibold uppercase tracking-wider whitespace-nowrap',
        TONE[tone],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  onRemove?: () => void;
  active?: boolean;
}

export function Chip({ onRemove, active, className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-6 px-2 text-[11px] font-medium rounded-full cursor-pointer transition-colors',
        active
          ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
          : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:bg-[var(--border)]',
        className,
      )}
      {...rest}
    >
      {children}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-1 opacity-60 hover:opacity-100"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
}
