'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge, Chip } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/components/ui/cn';

interface BrandRow {
  id: number;
  handle: string;
  name: string;
  category: string | null;
  region: string | null;
  country: string | null;
  tier: string;
  posts_count: number;
  products_count: number;
  people_count: number;
  total_content: number;
  completeness_pct: number;
  instagram_followers: number | null;
  employee_count: number | null;
  store_count: number | null;
  last_scraped_at: string | null;
  logo_url: string | null;
}

interface DirData {
  brands: BrandRow[];
  total: number;
  page: number;
  totalPages: number;
  facets: {
    categories: Array<{ name: string; count: number }>;
    regions: Array<{ name: string; count: number }>;
    tiers: Array<{ name: string; count: number }>;
  };
}

function formatNum(n: number | null): string {
  if (!n) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export function BrandDirectory() {
  const router = useRouter();
  const [data, setData] = React.useState<DirData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState<string | null>(null);
  const [region, setRegion] = React.useState<string | null>(null);
  const [tier, setTier] = React.useState<string | null>(null);
  const [view, setView] = React.useState<'table' | 'gallery'>('table');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: '80' });
    if (search.trim()) p.set('search', search.trim());
    if (category) p.set('category', category);
    if (region) p.set('region', region);
    if (tier) p.set('tier', tier);
    fetch(`/api/brands/tracked?${p}`).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [page, search, category, region, tier]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Brands</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            {data ? `${data.total.toLocaleString()} brands tracked` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[var(--surface-2)] rounded-[var(--radius)] p-0.5">
            {(['table', 'gallery'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-semibold capitalize transition-colors',
                  view === v ? 'bg-[var(--surface)] shadow-sm' : 'text-[var(--ink-muted)]',
                )}
              >{v}</button>
            ))}
          </div>
          <Button size="sm" variant="primary" onClick={() => router.push('/brands?new=1')}>+ Add brand</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Input
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
          placeholder="Search brands, handles, notes…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[220px]"
        />
        {data && (
          <>
            <FilterSelect label="Category" value={category} options={data.facets.categories} onChange={(v) => { setCategory(v); setPage(1); }} />
            <FilterSelect label="Region" value={region} options={data.facets.regions} onChange={(v) => { setRegion(v); setPage(1); }} />
            <FilterSelect label="Tier" value={tier} options={data.facets.tiers} onChange={(v) => { setTier(v); setPage(1); }} />
          </>
        )}
      </div>

      {/* Active filter chips */}
      {(category || region || tier) && (
        <div className="flex items-center gap-2 mb-3">
          {category && <Chip active onRemove={() => setCategory(null)}>{category}</Chip>}
          {region && <Chip active onRemove={() => setRegion(null)}>{region}</Chip>}
          {tier && <Chip active onRemove={() => setTier(null)}>tier: {tier}</Chip>}
        </div>
      )}

      {/* Body */}
      {loading && !data && <div className="space-y-2">{[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-12" />)}</div>}
      {data && view === 'table' && (
        <Card padding="none">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] z-10">
                <tr className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)]">
                  <th className="text-left py-2 px-3 font-semibold w-14">ID</th>
                  <th className="text-left py-2 px-2 font-semibold">Brand</th>
                  <th className="text-left py-2 px-2 font-semibold">Region</th>
                  <th className="text-left py-2 px-2 font-semibold">Category</th>
                  <th className="text-right py-2 px-2 font-semibold">Followers</th>
                  <th className="text-right py-2 px-2 font-semibold">Content</th>
                  <th className="text-right py-2 px-2 font-semibold">Posts</th>
                  <th className="text-right py-2 px-2 font-semibold">Products</th>
                  <th className="text-left py-2 px-2 font-semibold">Tier</th>
                  <th className="text-right py-2 px-2 font-semibold">Complete</th>
                </tr>
              </thead>
              <tbody>
                {data.brands.map((b, i) => (
                  <tr
                    key={b.id}
                    onClick={() => router.push(`/brands/${b.id}`)}
                    className={cn(
                      'border-b border-[var(--border)] last:border-b-0 cursor-pointer hover:bg-[var(--surface-2)] transition-colors',
                      i % 2 ? 'bg-[var(--surface-2)]/40' : '',
                    )}
                  >
                    <td className="py-2 px-3 font-mono text-[var(--accent)] text-[10px] font-semibold">#{b.id}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        {b.logo_url ? (
                          <img src={b.logo_url} alt="" className="w-6 h-6 rounded object-cover bg-[var(--surface-2)]" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-6 h-6 rounded bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-[10px] font-bold">{b.name.charAt(0)}</div>
                        )}
                        <span className="font-semibold">{b.name}</span>
                        <span className="text-[var(--ink-muted)] text-[11px]">@{b.handle}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-[var(--ink-muted)]">{b.region || '—'}</td>
                    <td className="py-2 px-2 text-[var(--ink-muted)]">{b.category || '—'}</td>
                    <td className="py-2 px-2 text-right font-mono">{formatNum(b.instagram_followers)}</td>
                    <td className="py-2 px-2 text-right font-mono font-semibold text-[var(--accent)]">{b.total_content.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right font-mono text-[var(--ink-muted)]">{b.posts_count || 0}</td>
                    <td className="py-2 px-2 text-right font-mono text-[var(--ink-muted)]">{b.products_count || 0}</td>
                    <td className="py-2 px-2">
                      <Badge tone={b.tier === 'fast' ? 'success' : b.tier === 'mid' ? 'warn' : 'neutral'} size="xs">{b.tier}</Badge>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <CompletenessBar pct={b.completeness_pct || 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {data && view === 'gallery' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {data.brands.map(b => (
            <Card key={b.id} variant="interactive" padding="md" onClick={() => router.push(`/brands/${b.id}`)}>
              {b.logo_url ? (
                <img src={b.logo_url} alt="" className="w-12 h-12 rounded object-cover bg-[var(--surface-2)] mb-2" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-12 h-12 rounded bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-[14px] font-bold mb-2">{b.name.charAt(0)}</div>
              )}
              <div className="text-[12px] font-semibold line-clamp-1 mb-0.5">{b.name}</div>
              <div className="text-[10px] text-[var(--ink-muted)] line-clamp-1">{b.category || '—'} · {formatNum(b.instagram_followers)}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
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

function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string | null; options: Array<{ name: string; count: number }>; onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-9 px-2 text-[12px] rounded-[var(--radius)] bg-[var(--surface-2)] text-[var(--ink)] outline-none border border-transparent focus:border-[var(--accent)]"
    >
      <option value="">All {label.toLowerCase()}</option>
      {options.map(o => (
        <option key={o.name} value={o.name}>{o.name} ({o.count.toLocaleString()})</option>
      ))}
    </select>
  );
}

function CompletenessBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? 'bg-[var(--success)]' : pct >= 40 ? 'bg-[var(--warn)]' : 'bg-[var(--danger)]';
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="w-12 h-1 bg-[var(--border)] rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-[var(--ink-muted)]">{pct}%</span>
    </div>
  );
}
