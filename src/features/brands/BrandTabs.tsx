'use client';

import * as React from 'react';
import { cn } from '@/components/ui/cn';

export type BrandTab = 'overview' | 'posts' | 'products' | 'people' | 'celebs' | 'reimagines' | 'links' | 'news' | 'compare';

const TABS: Array<{ k: BrandTab; label: string; countKey?: string }> = [
  { k: 'overview',   label: 'Overview' },
  { k: 'posts',      label: 'Posts',      countKey: 'posts' },
  { k: 'products',   label: 'Products',   countKey: 'products' },
  { k: 'people',     label: 'People',     countKey: 'people' },
  { k: 'celebs',     label: 'Celebs',     countKey: 'celeb_photos' },
  { k: 'reimagines', label: 'Reimagines', countKey: 'reimagines' },
  { k: 'links',      label: 'Links',      countKey: 'website_links' },
  { k: 'news',       label: 'News' },
  { k: 'compare',    label: 'Compare' },
];

export function BrandTabs({ active, counts, onChange }: {
  active: BrandTab;
  counts: Record<string, number>;
  onChange: (t: BrandTab) => void;
}) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg)] sticky top-14 z-[var(--z-sticky)]">
      <div className="max-w-6xl mx-auto px-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-0.5 min-w-max">
          {TABS.map(t => {
            const c = t.countKey ? counts[t.countKey] : undefined;
            const isActive = active === t.k;
            return (
              <button
                key={t.k}
                onClick={() => onChange(t.k)}
                className={cn(
                  'h-11 px-3 text-[13px] font-medium relative flex items-center gap-2 transition-colors',
                  isActive
                    ? 'text-[var(--ink)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]',
                )}
              >
                <span>{t.label}</span>
                {c !== undefined && c > 0 && (
                  <span className={cn(
                    'text-[10px] font-mono px-1.5 py-0.5 rounded',
                    isActive ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--surface-2)]',
                  )}>{c.toLocaleString()}</span>
                )}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
