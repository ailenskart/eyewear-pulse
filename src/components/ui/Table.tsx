import * as React from 'react';
import { cn } from './cn';

export function Table({ className, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full text-[12px]', className)} {...rest} />;
}

export function THead({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)]', className)} {...rest} />;
}

export function TBody({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...rest} />;
}

export function TR({ className, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors', className)} {...rest} />;
}

export function TH({ className, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('text-left py-2 px-2 font-semibold text-[10px] uppercase tracking-wider text-[var(--ink-soft)]', className)} {...rest} />;
}

export function TD({ className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('py-2 px-2 text-[var(--ink)]', className)} {...rest} />;
}

export function TableContainer({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden', className)}>
    <div className="max-h-[70vh] overflow-auto">{rest.children}</div>
  </div>;
}
