import * as React from 'react';
import { cn } from './cn';

type Size = 'sm' | 'md' | 'lg';
const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2 text-[11px]',
  md: 'h-9 px-3 text-[13px]',
  lg: 'h-11 px-4 text-[14px]',
};

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  sz?: Size;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function Input({ sz = 'md', icon, trailing, className, ...rest }: InputProps) {
  if (!icon && !trailing) {
    return (
      <input
        className={cn(
          'w-full rounded-[var(--radius)] bg-[var(--surface-2)] text-[var(--ink)] outline-none',
          'border border-transparent focus:border-[var(--accent)]',
          'placeholder:text-[var(--ink-soft)]',
          'transition-colors',
          SIZE[sz],
          className,
        )}
        {...rest}
      />
    );
  }
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] border border-transparent',
      'focus-within:border-[var(--accent)] transition-colors',
      SIZE[sz],
      'px-2',
      className,
    )}>
      {icon && <span className="text-[var(--ink-soft)] flex-shrink-0">{icon}</span>}
      <input
        className="flex-1 bg-transparent outline-none placeholder:text-[var(--ink-soft)]"
        {...rest}
      />
      {trailing && <span className="text-[var(--ink-soft)] flex-shrink-0">{trailing}</span>}
    </div>
  );
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'w-full rounded-[var(--radius)] bg-[var(--surface-2)] text-[var(--ink)] outline-none',
        'border border-transparent focus:border-[var(--accent)]',
        'placeholder:text-[var(--ink-soft)] px-3 py-2 text-[13px]',
        'resize-y min-h-[80px] transition-colors',
        className,
      )}
      {...rest}
    />
  );
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  sz?: Size;
}

export function Select({ sz = 'md', className, children, ...rest }: SelectProps) {
  return (
    <select
      className={cn(
        'rounded-[var(--radius)] bg-[var(--surface-2)] text-[var(--ink)] outline-none',
        'border border-transparent focus:border-[var(--accent)]',
        'transition-colors',
        SIZE[sz],
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
