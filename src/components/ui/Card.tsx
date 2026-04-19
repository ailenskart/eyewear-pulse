import * as React from 'react';
import { cn } from './cn';

type Variant = 'default' | 'photographic' | 'interactive';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const VARIANT: Record<Variant, string> = {
  default:      'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)]',
  photographic: 'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden',
  interactive:  'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] transition-all hover:border-[var(--accent)] hover:shadow-[var(--shadow)] cursor-pointer',
};

const PAD = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' } as const;

export function Card({ variant = 'default', padding = 'md', className, ...rest }: CardProps) {
  return <div className={cn(VARIANT[variant], PAD[padding], className)} {...rest} />;
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 mb-3', className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[14px] font-semibold tracking-tight', className)} {...rest} />;
}

export function CardSubtitle({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[12px] text-[var(--ink-muted)] mt-0.5', className)} {...rest} />;
}
