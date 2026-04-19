'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

interface ContentRow {
  id: number;
  brand_id: number | null;
  brand_handle: string | null;
  type: string;
  parent_id: number | null;
  title: string | null;
  caption: string | null;
  url: string | null;
  image_url: string | null;
  blob_url: string | null;
  person_name: string | null;
  person_title: string | null;
  likes: number;
  price: number | null;
  currency: string | null;
  posted_at: string | null;
  detected_at: string;
}

interface Data {
  content: ContentRow[];
  total: number;
  totalPages: number;
  page: number;
  typeBreakdown: Array<{ name: string; count: number }>;
}

function rel(d: string | null): string {
  if (!d) return '—';
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000);
  if (h < 1) return 'now';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function ContentPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = React.useState<Data | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState(params.get('search') || '');
  const [type, setType] = React.useState('');
  const [brandId, setBrandId] = React.useState('');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: '50' });
    if (type) p.set('type', type);
    if (brandId) p.set('brand_id', brandId);
    if (search) p.set('search', search);
    fetch(`/api/content?${p}`).then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, [page, type, brandId, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Content</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            {data ? `${data.total.toLocaleString()} rows across all brands` : 'Loading…'}
          </p>
        </div>
      </div>

      {/* Type chips */}
      {data && data.typeBreakdown.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => { setType(''); setPage(1); }}
            className={cn('h-8 px-3 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors',
              type === '' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-[var(--surface-2)] text-[var(--ink-muted)]')}>
            All · {data.total.toLocaleString()}
          </button>
          {data.typeBreakdown.map(t => (
            <button
              key={t.name}
              onClick={() => { setType(t.name); setPage(1); }}
              className={cn('h-8 px-3 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors',
                type === t.name ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:bg-[var(--border)]')}>
              {t.name} · {t.count.toLocaleString()}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Input
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
          placeholder="Search captions, titles, person names…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[240px]"
        />
        <Input
          placeholder="Brand ID"
          value={brandId}
          onChange={(e) => { setBrandId(e.target.value.replace(/\D/g, '')); setPage(1); }}
          className="w-24"
        />
      </div>

      {loading && !data && <div className="space-y-2">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-14" />)}</div>}
      {data && data.content.length === 0 && <EmptyState title="Nothing matches" description="Try clearing filters or searching a brand name." />}

      {data && data.content.length > 0 && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] z-10">
                <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)]">
                  <th className="text-left py-2 px-3 font-semibold w-14">ID</th>
                  <th className="text-left py-2 px-2 font-semibold">Type</th>
                  <th className="text-left py-2 px-2 font-semibold">Brand</th>
                  <th className="text-left py-2 px-2 font-semibold">Title / Who</th>
                  <th className="text-left py-2 px-2 font-semibold">URL / Info</th>
                  <th className="text-right py-2 px-2 font-semibold">Metric</th>
                  <th className="text-right py-2 px-3 font-semibold w-16">When</th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((c, i) => (
                  <tr key={c.id} className={cn('border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors', i % 2 ? 'bg-[var(--surface-2)]/40' : '')}>
                    <td className="py-2 px-3 font-mono text-[10px] text-[var(--ink-soft)]">#{c.id}</td>
                    <td className="py-2 px-2"><Badge tone={c.type === 'product' ? 'warn' : c.type === 'person' ? 'success' : c.type === 'ig_post' ? 'accent' : 'neutral'} size="xs">{c.type}</Badge></td>
                    <td className="py-2 px-2">
                      {c.brand_id && (
                        <button onClick={() => router.push(`/brands/${c.brand_id}`)} className="font-mono text-[10px] text-[var(--accent)] hover:underline">
                          #{c.brand_id} · {c.brand_handle}
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-2 max-w-[240px] truncate">
                      {c.person_name || c.title || (c.caption ? c.caption.slice(0, 80) : '—')}
                      {c.person_title && <span className="text-[var(--ink-muted)] block text-[10px]">{c.person_title}</span>}
                    </td>
                    <td className="py-2 px-2 max-w-[220px] truncate">
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline truncate">
                          {c.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50)}
                        </a>
                      ) : <span className="text-[var(--ink-soft)]">—</span>}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[10px]">
                      {c.price ? `${c.currency === 'EUR' ? '€' : c.currency === 'GBP' ? '£' : c.currency === 'INR' ? '₹' : '$'}${c.price}` :
                       c.likes > 0 ? `♥ ${c.likes.toLocaleString()}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-[10px] text-[var(--ink-soft)]">{rel(c.posted_at || c.detected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <Button size="sm" variant="secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <span className="text-[11px] text-[var(--ink-muted)] font-mono">Page {page} / {data.totalPages}</span>
          <Button size="sm" variant="secondary" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>Next</Button>
        </div>
      )}
    </div>
  );
}
