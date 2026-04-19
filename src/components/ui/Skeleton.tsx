import * as React from 'react';
import { cn } from './cn';

/** Rectangular shimmer used in skeleton states. */
export function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} {...rest} />;
}

/** Empty-state placeholder — always show a CTA, never a dead-end. */
export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 px-6 text-center',
      'bg-[var(--surface-2)] rounded-[var(--radius-lg)]',
      className,
    )}>
      {icon && <div className="mb-3 text-[var(--ink-soft)]">{icon}</div>}
      <div className="text-[14px] font-semibold text-[var(--ink)] mb-1">{title}</div>
      {description && <div className="text-[12px] text-[var(--ink-muted)] max-w-md mb-4">{description}</div>}
      {action}
    </div>
  );
}
