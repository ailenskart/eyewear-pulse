'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '../ui/cn';
import { CommandPalette } from './CommandPalette';

const NAV_ITEMS = [
  { k: 'feed',         label: 'Feed',         icon: '⧉' },
  { k: 'brands',       label: 'Brands',       icon: '◉' },
  { k: 'products',     label: 'Products',     icon: '◘' },
  { k: 'people',       label: 'People',       icon: '●' },
  { k: 'celebrities',  label: 'Celebs',       icon: '★' },
  { k: 'trends',       label: 'Trends',       icon: '↗' },
  { k: 'reimagine',    label: 'Reimagine',    icon: '◈' },
  { k: 'boards',       label: 'Boards',       icon: '▣' },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [dense, setDense] = React.useState(false);

  // Load density preference
  React.useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lenzy:density') : null;
    if (saved === 'dense') {
      setDense(true);
      document.documentElement.setAttribute('data-density', 'dense');
    }
    const rail = typeof window !== 'undefined' ? localStorage.getItem('lenzy:rail') : null;
    if (rail === 'collapsed') setRailCollapsed(true);
  }, []);

  // Keyboard shortcuts: Cmd+K / Cmd+B / Cmd+D
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'k') { e.preventDefault(); setPaletteOpen(v => !v); }
      if (mod && e.key === 'b') { e.preventDefault(); toggleRail(); }
      if (mod && e.key === 'd' && !e.shiftKey) { e.preventDefault(); toggleDense(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleRail() {
    setRailCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('lenzy:rail', next ? 'collapsed' : 'expanded');
      return next;
    });
  }
  function toggleDense() {
    setDense(prev => {
      const next = !prev;
      document.documentElement.setAttribute('data-density', next ? 'dense' : 'normal');
      localStorage.setItem('lenzy:density', next ? 'dense' : 'normal');
      return next;
    });
  }

  const activeKey = React.useMemo(() => {
    const seg = pathname.split('/').filter(Boolean)[0] || 'feed';
    return seg;
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      {/* Top bar */}
      <header className="sticky top-0 z-[var(--z-nav)] h-14 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="h-full flex items-center px-4 gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleRail}
              className="w-8 h-8 flex items-center justify-center rounded-[var(--radius)] hover:bg-[var(--surface-2)] text-[var(--ink-muted)]"
              aria-label="Toggle side nav"
              title="⌘B"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <span className="font-semibold tracking-tight text-[15px]">Lenzy</span>
            <span className="text-[10px] text-[var(--ink-soft)] font-mono hidden md:block">v2.0</span>
          </div>

          {/* Search trigger (opens palette) */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex-1 max-w-xl h-9 px-3 rounded-[var(--radius)] bg-[var(--surface-2)] hover:bg-[var(--border)] text-left text-[13px] text-[var(--ink-muted)] flex items-center gap-2 transition-colors mx-auto"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <span>Search brands, people, products…</span>
            <span className="ml-auto text-[10px] font-mono bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5">⌘K</span>
          </button>

          {/* Right side */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleDense}
              className={cn(
                'h-9 px-2 rounded-[var(--radius)] text-[11px] font-semibold',
                dense ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'hover:bg-[var(--surface-2)] text-[var(--ink-muted)]',
              )}
              title="Toggle density (⌘D)"
            >
              {dense ? 'Dense' : 'Calm'}
            </button>
            <div className="w-9 h-9 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-[12px] font-bold">L</div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Left rail */}
        <nav
          className={cn(
            'sticky top-14 self-start border-r border-[var(--border)] bg-[var(--bg)] transition-all',
            'hidden md:block',
            railCollapsed ? 'w-14' : 'w-48',
          )}
          style={{ height: 'calc(100vh - 56px)' }}
        >
          <div className="p-2">
            {NAV_ITEMS.map(item => {
              const active = activeKey === item.k || (activeKey === '' && item.k === 'feed');
              return (
                <button
                  key={item.k}
                  onClick={() => router.push(`/${item.k}`)}
                  className={cn(
                    'w-full flex items-center gap-3 h-9 px-2 rounded-[var(--radius)] text-[13px] transition-colors',
                    active
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                      : 'text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
                  )}
                  title={item.label}
                >
                  <span className="w-4 text-center">{item.icon}</span>
                  {!railCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content area */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      {/* Command palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-[var(--z-nav)] md:hidden bg-[var(--bg)]/95 backdrop-blur border-t border-[var(--border)]">
        <div className="flex justify-around items-center px-2 py-1" style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom))' }}>
          {NAV_ITEMS.slice(0, 5).map(item => {
            const active = activeKey === item.k;
            return (
              <button
                key={item.k}
                onClick={() => router.push(`/${item.k}`)}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-[var(--radius)]',
                  active ? 'text-[var(--accent)]' : 'text-[var(--ink-muted)]',
                )}
              >
                <span className="text-[14px]">{item.icon}</span>
                <span className="text-[9px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
