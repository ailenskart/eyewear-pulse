'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardTitle, CardSubtitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/components/ui/cn';

interface WatchlistItem {
  brand_id: number;
  handle: string;
  name: string;
  logo_url?: string | null;
  category?: string | null;
  region?: string | null;
  note?: string;
  added_at: string;
}

const STORAGE_KEY = 'lenzy:watchlist:v1';

function load(): WatchlistItem[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    return JSON.parse(raw) as WatchlistItem[];
  } catch { return []; }
}
function save(items: WatchlistItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function WatchlistPage() {
  const router = useRouter();
  const [items, setItems] = React.useState<WatchlistItem[]>([]);
  const [search, setSearch] = React.useState('');
  const [brands, setBrands] = React.useState<Array<{ id: number; handle: string; name: string; logo_url: string | null; category: string | null; region: string | null }>>([]);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addSearch, setAddSearch] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => { setItems(load()); }, []);

  React.useEffect(() => {
    if (!addOpen || !addSearch.trim()) { setBrands([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/v1/brands?search=${encodeURIComponent(addSearch)}&limit=10`)
        .then(r => r.json())
        .then(d => { setBrands(d.brands || []); setLoading(false); })
        .catch(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [addOpen, addSearch]);

  const addBrand = (b: typeof brands[0]) => {
    if (items.some(w => w.brand_id === b.id)) return;
    const next = [{ brand_id: b.id, handle: b.handle, name: b.name, logo_url: b.logo_url, category: b.category, region: b.region, added_at: new Date().toISOString() }, ...items];
    setItems(next); save(next);
    setAddOpen(false); setAddSearch('');
  };

  const remove = (brand_id: number) => {
    const next = items.filter(w => w.brand_id !== brand_id);
    setItems(next); save(next);
  };

  const filtered = search.trim()
    ? items.filter(w => w.name.toLowerCase().includes(search.toLowerCase()) || w.handle.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="max-w-5xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Watchlist</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            {items.length} brand{items.length !== 1 ? 's' : ''} you're tracking
          </p>
        </div>
        <Button size="md" onClick={() => setAddOpen(true)}>+ Add brand</Button>
      </div>

      {items.length > 3 && (
        <Input
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
          placeholder="Filter watchlist…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 max-w-xs"
        />
      )}

      {items.length === 0 && (
        <EmptyState
          title="Your watchlist is empty"
          description="Add brands to track their posts, products, people moves, and news — all in one place."
          action={<Button onClick={() => setAddOpen(true)}>Add your first brand</Button>}
        />
      )}

      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(w => (
            <Card key={w.brand_id} variant="interactive" padding="sm">
              <div className="flex items-center gap-3">
                {w.logo_url ? (
                  <img src={w.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-[var(--surface-2)]" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[14px] font-bold text-[var(--ink-soft)]">
                    {(w.name || w.handle)[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/brands/${w.brand_id}`)}>
                  <div className="text-[13px] font-semibold truncate">{w.name}</div>
                  <div className="text-[11px] text-[var(--ink-muted)]">@{w.handle}</div>
                </div>
                <div className="flex items-center gap-2">
                  {w.category && <Badge size="xs">{w.category}</Badge>}
                  {w.region && <Badge size="xs" tone="neutral">{w.region}</Badge>}
                  <button onClick={(e) => { e.stopPropagation(); remove(w.brand_id); }}
                    className="text-[11px] text-[var(--danger)] hover:underline ml-2">
                    Remove
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border)]">
              <Input
                autoFocus
                placeholder="Search brands to add…"
                value={addSearch}
                onChange={e => setAddSearch(e.target.value)}
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto p-2">
              {loading && <div className="p-3 text-center text-[12px] text-[var(--ink-muted)]">Searching…</div>}
              {!loading && brands.length === 0 && addSearch.trim() && (
                <div className="p-3 text-center text-[12px] text-[var(--ink-muted)]">No brands found</div>
              )}
              {brands.map(b => {
                const already = items.some(w => w.brand_id === b.id);
                return (
                  <button
                    key={b.id}
                    disabled={already}
                    onClick={() => addBrand(b)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2 rounded-[var(--radius)] text-left transition-colors',
                      already ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--surface-2)]',
                    )}>
                    {b.logo_url ? (
                      <img src={b.logo_url} alt="" className="w-8 h-8 rounded-md object-cover bg-[var(--surface-2)]" />
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-[var(--surface-2)] flex items-center justify-center text-[12px] font-bold text-[var(--ink-soft)]">
                        {(b.name || b.handle)[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold truncate">{b.name}</div>
                      <div className="text-[11px] text-[var(--ink-muted)]">@{b.handle}</div>
                    </div>
                    {already && <span className="text-[10px] text-[var(--ink-muted)]">Added</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
