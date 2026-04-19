'use client';

import * as React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Skeleton';
import type { Person } from './types';

export function BrandPeople({ items }: { items: Person[] }) {
  if (items.length === 0) {
    return <div className="max-w-6xl mx-auto px-4 py-8">
      <EmptyState
        title="No people mapped yet"
        description="Add people manually or run the LinkedIn company scrape."
      />
    </div>;
  }
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(p => (
          <Card key={p.id} padding="md" variant="interactive">
            <div className="flex items-start gap-3">
              {p.photo_url ? (
                <img src={p.photo_url} alt={p.name} className="w-12 h-12 rounded-full object-cover bg-[var(--surface-2)] flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-[14px] font-bold flex-shrink-0">
                  {p.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-semibold truncate">{p.name}</span>
                  {p.seniority && <Badge tone="accent" size="xs">{p.seniority}</Badge>}
                </div>
                {p.title && <div className="text-[12px] text-[var(--ink-muted)] mb-0.5">{p.title}</div>}
                <div className="flex items-center gap-2 text-[10px] text-[var(--ink-soft)]">
                  {p.department && <span>{p.department}</span>}
                  {p.location && <span>· {p.location}</span>}
                </div>
                {p.linkedin_url && (
                  <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--accent)] hover:underline mt-1 inline-block">
                    LinkedIn →
                  </a>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
