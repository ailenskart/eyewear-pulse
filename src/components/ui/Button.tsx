import * as React from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  full?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:   'bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-90 disabled:opacity-50',
  secondary: 'bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--border)] disabled:opacity-50',
  ghost:     'text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]',
  danger:    'bg-[var(--danger)] text-white hover:opacity-90 disabled:opacity-50',
};
const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[11px] gap-1',
  md: 'h-9 px-3 text-[13px] gap-1.5',
  lg: 'h-11 px-4 text-[14px] gap-2',
};

export function Button({
  variant = 'primary', size = 'md', loading, icon, iconRight, full,
  className, children, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius)] font-semibold whitespace-nowrap transition-all',
        'active:scale-[0.98]',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size} /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

function Spinner({ size }: { size: Size }) {
  const s = size === 'lg' ? 16 : size === 'md' ? 14 : 12;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="42" strokeDashoffset="16" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
