'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MediaCard } from '@/components/ui/MediaCard';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';

interface Product {
  id: string;
  brand: string;
  name: string;
  price: string;
  comparePrice: string;
  image: string;
  type: string;
  url: string;
}

interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
  brands: string[];
  totalProducts: number;
  totalBrands: number;
  mix?: boolean;
}

export function ProductsPage() {
  const router = useRouter();
  const [data, setData] = React.useState<ProductsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [brand, setBrand] = React.useState<string>('All');
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState('newest');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: '60', sortBy: sort });
    if (brand && brand !== 'All') p.set('brand', brand);
    if (search) p.set('search', search);
    if (!brand || brand === 'All') p.set('mix', '1');
    fetch(`/api/products?${p}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page, brand, search, sort]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Products</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            {data ? `${data.totalProducts.toLocaleString()} SKUs across ${data.totalBrands} brands` : 'Loading catalog\u2026'}
          </p>
        </div>
      </div>

      {/* Brand pills */}
      {data?.brands && (
        <Card padding="md" className="mb-5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-muted)] mb-2">Browse catalog by brand</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { setBrand('All'); setPage(1); }}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors ${
                brand === 'All'
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface-2)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'
              }`}
            >
              All Brands
            </button>
            {data.brands.map(b => (
              <button
                key={b}
                onClick={() => { setBrand(b); setPage(1); }}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors ${
                  brand === b
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface-2)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Input
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
          placeholder="Search products\u2026"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[240px]"
        />
        <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low \u2192 high</option>
          <option value="price_desc">Price: high \u2192 low</option>
          <option value="name">Name A-Z</option>
          <option value="brand">Brand A-Z</option>
          <option value="random">Shuffle</option>
        </Select>
      </div>

      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {[1,2,3,4,5,6,7,8,9,10].map(i => <Skeleton key={i} className="aspect-square" />)}
        </div>
      )}

      {data && data.products.length === 0 && (
        <EmptyState title="No products found" description="Try a different search term or brand filter." />
      )}

      {data && data.products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {data.products.map(p => (
            <MediaCard
              key={p.id}
              image={p.image || ''}
              aspect="square"
              title={p.name}
              subtitle={[p.price, p.type].filter(Boolean).join(' \u00B7 ') || undefined}
              href={p.url || undefined}
              overlayTop={
                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-black/50 text-white backdrop-blur">
                  {p.brand}
                </span>
              }
            />
          ))}
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
