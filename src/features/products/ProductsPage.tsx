'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MediaCard } from '@/components/ui/MediaCard';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';

interface Product {
  id: number;
  brand: string;
  brand_id: number | null;
  brand_handle: string | null;
  name: string;
  price: number | null;
  compare_price: number | null;
  currency: string | null;
  image_url: string | null;
  blob_url: string | null;
  product_type: string | null;
  product_url: string | null;
}

export function ProductsPage() {
  const router = useRouter();
  const [data, setData] = React.useState<{ products: Product[]; total: number; totalPages: number; topBrands: Array<{ brand_id: number; brand: string; brand_handle: string; count: number }>; brand: { id: number; handle: string; name: string } | null } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [brandId, setBrandId] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState('recent');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: '60', sortBy: sort });
    if (brandId) p.set('brand_id', String(brandId));
    if (search) p.set('search', search);
    fetch(`/api/products/list?${p}`).then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, [page, brandId, search, sort]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Products</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            {data ? `${data.total.toLocaleString()} SKUs across all brands` : 'Loading catalog…'}
          </p>
        </div>
      </div>

      {!brandId && data?.topBrands && (
        <Card padding="md" className="mb-5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-muted)] mb-2">Browse catalog by brand</div>
          <div className="flex flex-wrap gap-1.5">
            {data.topBrands.slice(0, 30).map(tb => (
              <button key={tb.brand_id} onClick={() => { setBrandId(tb.brand_id); setPage(1); }}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[var(--surface-2)] text-[11px] font-medium hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors">
                <span className="text-[var(--accent)] font-mono font-semibold">#{tb.brand_id}</span>
                {tb.brand}
                <span className="text-[9px] text-[var(--ink-muted)]">·{tb.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {brandId && data?.brand && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-1.5 py-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded font-mono font-semibold">#{data.brand.id}</span>
            <span className="text-[15px] font-semibold">{data.brand.name}</span>
            <span className="text-[12px] text-[var(--ink-muted)]">@{data.brand.handle}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { setBrandId(null); setPage(1); }}>× Change brand</Button>
          <Button size="sm" variant="secondary" onClick={() => router.push(`/brands/${data.brand?.id}`)}>View brand →</Button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Input
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
          placeholder="Search products…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[240px]"
        />
        <Select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Most recent</option>
          <option value="price_asc">Price: low → high</option>
          <option value="price_desc">Price: high → low</option>
          <option value="name">Name A-Z</option>
        </Select>
      </div>

      {loading && !data && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{[1,2,3,4,5,6,7,8,9,10].map(i => <Skeleton key={i} className="aspect-square" />)}</div>}

      {data && data.products.length === 0 && <EmptyState title="No products yet" description="Add brands or run the sitemap scraper to populate the catalog." />}

      {data && data.products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {data.products.map(p => {
            const sym = p.currency === 'EUR' ? '€' : p.currency === 'GBP' ? '£' : p.currency === 'INR' ? '₹' : '$';
            const price = p.price ? `${sym}${Number(p.price).toLocaleString()}` : '';
            return (
              <MediaCard
                key={p.id}
                image={p.blob_url || p.image_url || ''}
                aspect="square"
                title={p.name}
                subtitle={[price, p.product_type].filter(Boolean).join(' · ') || undefined}
                href={p.product_url || undefined}
                overlayTop={p.brand_id ? <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/brands/${p.brand_id}`); }} className="text-[9px] font-mono px-1 py-0.5 rounded bg-black/50 text-white backdrop-blur">#{p.brand_id}</button> : undefined}
              />
            );
          })}
        </div>
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
