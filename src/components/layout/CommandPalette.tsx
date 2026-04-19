'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '../ui/cn';

interface Result {
  kind: 'brand' | 'person' | 'product' | 'celebrity' | 'action' | 'search';
  title: string;
  subtitle?: string;
  action: () => void;
  icon?: string;
}

const ACTIONS: Result[] = [
  { kind: 'action', title: 'Add brand',                  icon: '+', action: () => { window.location.href = '/brands?new=1'; } },
  { kind: 'action', title: 'Open Reimagine Studio',      icon: '◈', action: () => { window.location.href = '/reimagine'; } },
  { kind: 'action', title: 'Go to daily digest',         icon: '☀', action: () => { window.location.href = '/news'; } },
  { kind: 'action', title: 'Open admin dashboard',       icon: '⚙', action: () => { window.location.href = '/admin'; } },
  { kind: 'action', title: 'Toggle dense mode',          icon: '▦', action: () => { document.documentElement.toggleAttribute('data-density'); } },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<Result[]>([]);
  const [selected, setSelected] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Autofocus
  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) setQuery('');
  }, [open]);

  // Fetch results (debounced)
  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) { setResults(ACTIONS); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&limit=10`);
        const data = await res.json();
        const merged: Result[] = [];

        (data.brands || []).forEach((b: { id: number; name: string; handle: string; category: string | null }) => {
          merged.push({
            kind: 'brand',
            title: b.name,
            subtitle: `#${b.id} · @${b.handle}${b.category ? ' · ' + b.category : ''}`,
            action: () => router.push(`/brands/${b.id}`),
            icon: '◉',
          });
        });
        (data.people || []).forEach((p: { id: number; name: string; title: string | null; company_current: string | null }) => {
          merged.push({
            kind: 'person',
            title: p.name,
            subtitle: `${p.title || ''}${p.company_current ? ' · ' + p.company_current : ''}`,
            action: () => router.push(`/people?id=${p.id}`),
            icon: '●',
          });
        });
        (data.products || []).slice(0, 5).forEach((p: { id: number; title: string | null; brand_handle: string | null; price: number | null }) => {
          merged.push({
            kind: 'product',
            title: p.title || 'Product',
            subtitle: `${p.brand_handle ? '@' + p.brand_handle + ' · ' : ''}${p.price ? '$' + p.price : ''}`,
            action: () => router.push(`/products?id=${p.id}`),
            icon: '◘',
          });
        });
        merged.push({ kind: 'search', title: `Search all content for "${q}"`, icon: '⌕', action: () => router.push(`/content?search=${encodeURIComponent(q)}`) });
        setResults(merged);
      } catch {
        setResults(ACTIONS);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, open, router]);

  // Keyboard nav
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(results.length - 1, s + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(0, s - 1)); }
      if (e.key === 'Enter')     { e.preventDefault(); results[selected]?.action(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, results, selected, onClose]);

  React.useEffect(() => { setSelected(0); }, [results.length]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-palette)] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
      style={{ animation: 'fadeIn 120ms var(--ease-out)' }}
    >
      <div
        className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'pop 180ms var(--ease-out)' }}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--border)]">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-[var(--ink-muted)]"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search brands, people, products…"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-[var(--ink-soft)]"
          />
          {loading && <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />}
          <span className="text-[10px] font-mono text-[var(--ink-soft)]">ESC</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1">
          {results.length === 0 && (
            <div className="p-6 text-center text-[12px] text-[var(--ink-muted)]">
              No matches. Try a brand name, a CEO, or a product type.
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${i}-${r.title}`}
              onClick={() => { r.action(); onClose(); }}
              onMouseEnter={() => setSelected(i)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-left transition-colors',
                selected === i ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]',
              )}
            >
              <span className={cn(
                'w-7 h-7 flex items-center justify-center rounded text-[12px] font-semibold',
                r.kind === 'brand'      ? 'bg-[var(--accent-soft)] text-[var(--accent)]' :
                r.kind === 'person'     ? 'bg-[var(--success-soft)] text-[var(--success)]' :
                r.kind === 'product'    ? 'bg-[var(--warn-soft)] text-[var(--warn)]' :
                r.kind === 'celebrity'  ? 'bg-[var(--danger-soft)] text-[var(--danger)]' :
                'bg-[var(--surface-2)] text-[var(--ink-muted)]',
              )}>{r.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{r.title}</div>
                {r.subtitle && <div className="text-[11px] text-[var(--ink-muted)] truncate">{r.subtitle}</div>}
              </div>
              <span className="text-[9px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">{r.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
