import * as React from 'react';
import { cn } from './cn';

export interface TimelineItem {
  id: string | number;
  icon?: React.ReactNode;
  type: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  when: string;
  href?: string;
  onClick?: () => void;
}

export function Timeline({ items, empty }: { items: TimelineItem[]; empty?: React.ReactNode }) {
  if (items.length === 0 && empty) return <>{empty}</>;
  return (
    <ol className="relative border-l border-[var(--border)] ml-2">
      {items.map((item, i) => (
        <TimelineRow key={item.id} item={item} isLast={i === items.length - 1} />
      ))}
    </ol>
  );
}

function TimelineRow({ item }: { item: TimelineItem; isLast: boolean }) {
  const body = (
    <>
      <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]" />
      <div className="flex items-center gap-2 mb-0.5">
        {item.icon && <span className="text-[var(--ink-muted)]">{item.icon}</span>}
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-muted)]">{item.type}</span>
        <span className="text-[10px] text-[var(--ink-soft)] ml-auto">{item.when}</span>
      </div>
      <div className="text-[13px] font-semibold text-[var(--ink)] leading-snug">{item.title}</div>
      {item.description && <div className="text-[12px] text-[var(--ink-muted)] mt-0.5 leading-relaxed">{item.description}</div>}
    </>
  );
  const cls = cn(
    'relative pl-4 pb-5',
    (item.href || item.onClick) && 'cursor-pointer hover:bg-[var(--surface-2)] rounded-[var(--radius)] -ml-2 pl-6 pr-2 py-1 transition-colors',
  );
  if (item.href) return <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>;
  if (item.onClick) return <li onClick={item.onClick} className={cls}>{body}</li>;
  return <li className={cls}>{body}</li>;
}
