'use client';

import * as React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/components/ui/cn';

interface Summary {
  brands: number;
  content: number;
  people: number;
  products: number;
  ig_posts: number;
  celeb_photos: number;
  reimagines: number;
  website_links: number;
  last_cron: { tier: string; ran_at: string; new_posts: number } | null;
  recent_uploads: Array<{ filename: string; format: string; inserted: number; updated: number; uploaded_at: string }>;
}

export function AdminPage() {
  const [sub, setSub] = React.useState<'usage' | 'crons' | 'data'>('usage');
  const [summary, setSummary] = React.useState<Summary | null>(null);

  React.useEffect(() => {
    // Aggregate from the export summary endpoint + tracked-brands GET
    fetch('/api/brands/export?format=json').then(r => r.json()).then(d => {
      const rows = (d.brands || []) as Array<Record<string, number>>;
      const initial: Omit<Summary, 'last_cron' | 'recent_uploads'> = { brands: 0, content: 0, products: 0, ig_posts: 0, people: 0, celeb_photos: 0, reimagines: 0, website_links: 0 };
      const sum = rows.reduce((acc: Omit<Summary, 'last_cron' | 'recent_uploads'>, r) => ({
        brands: acc.brands + 1,
        content: acc.content + (r.total_content || 0),
        products: acc.products + (r.products || 0),
        ig_posts: acc.ig_posts + (r.ig_posts || 0),
        people: acc.people + (r.people || 0),
        celeb_photos: acc.celeb_photos + (r.celeb_photos || 0),
        reimagines: acc.reimagines + (r.reimagines || 0),
        website_links: acc.website_links + (r.website_links || 0),
      }), initial);
      setSummary({ ...sum, last_cron: null, recent_uploads: [] });
    });
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Admin</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">System health, data quality, cron monitoring</p>
        </div>
        <a href="/admin/review" className="text-[12px] font-semibold text-[var(--accent)] hover:underline">
          Review queue →
        </a>
      </div>

      <div className="flex gap-1 mb-5">
        {(['usage', 'crons', 'data'] as const).map(s => (
          <button key={s} onClick={() => setSub(s)}
            className={cn(
              'h-8 px-3 rounded-[var(--radius)] text-[12px] font-semibold capitalize transition-colors',
              sub === s ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:bg-[var(--border)]',
            )}>{s}</button>
        ))}
      </div>

      {sub === 'usage' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Brands"         value={summary?.brands} />
          <StatTile label="Total content"  value={summary?.content} tone="accent" />
          <StatTile label="People"         value={summary?.people} />
          <StatTile label="Products"       value={summary?.products} />
          <StatTile label="IG posts"       value={summary?.ig_posts} />
          <StatTile label="Website links"  value={summary?.website_links} />
          <StatTile label="Celeb photos"   value={summary?.celeb_photos} />
          <StatTile label="Reimagines"     value={summary?.reimagines} tone="success" />
        </div>
      )}

      {sub === 'crons' && (
        <Card padding="md">
          <h3 className="text-[13px] font-semibold mb-3">Cron schedule</h3>
          <div className="space-y-2 text-[12px]">
            <CronRow tier="fast"         schedule="Hourly"           scope="30 priority brands" />
            <CronRow tier="mid"          schedule="Every 6 hours"    scope="~100 D2C + Luxury + Sports" />
            <CronRow tier="full"         schedule="Daily 06:30 UTC"  scope="All 3,500+ brands" />
            <CronRow tier="celebrities"  schedule="Every 4 hours"    scope="10 rotating celebs" />
            <CronRow tier="digest"       schedule="Weekdays 09:00 IST (pending Resend wire)"  scope="Daily brief email" />
            <CronRow tier="embeddings"   schedule="Nightly"          scope="pgvector backfill for new products" />
          </div>
        </Card>
      )}

      {sub === 'data' && (
        <Card padding="md">
          <h3 className="text-[13px] font-semibold mb-3">Data quality</h3>
          <p className="text-[12px] text-[var(--ink-muted)] mb-4">Completeness distribution, stale brands, broken images — coming in Phase 6 with full observability wire-up.</p>
          <div className="space-y-2">
            {summary?.recent_uploads && summary.recent_uploads.length > 0 ? summary.recent_uploads.map((u, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] border-b border-[var(--border)] pb-2">
                <div className="font-medium">{u.filename || u.format}</div>
                <div className="text-[var(--ink-muted)]">+{u.inserted} / {u.updated} updated</div>
              </div>
            )) : <div className="text-[12px] text-[var(--ink-muted)]">No recent uploads.</div>}
          </div>
        </Card>
      )}
    </div>
  );
}

function StatTile({ label, value, tone = 'neutral' }: { label: string; value: number | undefined; tone?: 'neutral' | 'accent' | 'success' }) {
  return (
    <Card padding="md">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">{label}</div>
      {value === undefined ? <Skeleton className="h-7 mt-1" /> : (
        <div className={cn('text-[22px] font-semibold mt-1 tabular-nums',
          tone === 'accent' ? 'text-[var(--accent)]' : tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--ink)]')}>
          {value.toLocaleString()}
        </div>
      )}
    </Card>
  );
}

function CronRow({ tier, schedule, scope }: { tier: string; schedule: string; scope: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0">
      <div className="flex items-center gap-3">
        <Badge tone={tier === 'fast' ? 'success' : tier === 'mid' ? 'warn' : tier === 'celebrities' ? 'accent' : 'neutral'}>{tier}</Badge>
        <span className="text-[12px] font-medium">{schedule}</span>
      </div>
      <span className="text-[11px] text-[var(--ink-muted)]">{scope}</span>
    </div>
  );
}
