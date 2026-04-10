import { NextRequest, NextResponse } from 'next/server';
import productsData from '@/data/products.json';

/**
 * Products API — reads from src/data/products.json (21k+ products
 * across 45+ brands). Previously hit Supabase which had a stale
 * 1000-row subset of only 5 brands.
 *
 * JSON schema (compact keys to keep the file size manageable):
 *   b  = brand
 *   n  = name
 *   p  = price (string)
 *   cp = compare price (string)
 *   i  = image URL
 *   t  = product type
 *   u  = product URL
 */

interface RawProduct {
  b?: string;
  n?: string;
  p?: string | number;
  cp?: string | number;
  i?: string;
  t?: string;
  u?: string;
}

interface OutProduct {
  id: string;
  brand: string;
  name: string;
  price: string;
  comparePrice: string;
  image: string;
  type: string;
  url: string;
}

const ALL: RawProduct[] = productsData as RawProduct[];

// Pre-compute the clean, deduped list once per server cold start.
const CLEAN: OutProduct[] = (() => {
  const seen = new Set<string>();
  const out: OutProduct[] = [];
  for (const p of ALL) {
    if (!p.b || !p.n || !p.i) continue;
    const url = p.u || '';
    // Dedupe by product URL (or brand+name if URL missing)
    const key = url || `${p.b}|${p.n}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      brand: p.b,
      name: p.n,
      price: p.p ? `$${Number(p.p).toFixed(2)}` : '',
      comparePrice: p.cp && Number(p.cp) > 0 ? `$${Number(p.cp).toFixed(2)}` : '',
      image: p.i,
      type: p.t || 'Eyewear',
      url,
    });
  }
  return out;
})();

const ALL_BRANDS = [...new Set(CLEAN.map(p => p.brand))].sort();

// Pre-group by brand so the mix=1 fast path doesn't have to re-scan.
const BY_BRAND: Map<string, OutProduct[]> = (() => {
  const m = new Map<string, OutProduct[]>();
  for (const p of CLEAN) {
    if (!m.has(p.brand)) m.set(p.brand, []);
    m.get(p.brand)!.push(p);
  }
  return m;
})();

function fisherYates<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand');
  const search = (searchParams.get('search') || '').toLowerCase().trim();
  const sortBy = searchParams.get('sortBy') || 'newest';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '40');
  const mix = searchParams.get('mix') === '1';
  const id = searchParams.get('id');

  // ── Direct product lookup for deep-links (/products/<id>) ─────────
  if (id) {
    const match = CLEAN.find(p => p.id === id || p.url === id);
    return NextResponse.json({
      products: match ? [match] : [],
      total: match ? 1 : 0,
      brands: ALL_BRANDS,
      totalProducts: CLEAN.length,
      totalBrands: ALL_BRANDS.length,
    });
  }

  // ── Per-brand equal sampling mode for the "All" feed ────────────
  if (mix && (!brand || brand === 'All') && !search) {
    // Shuffle each brand's products and take the first N. Every brand
    // in ALL_BRANDS contributes the same number of items so the feed
    // is an even mix regardless of how many products each brand has.
    const perBrand = Math.max(4, Math.ceil(limit / Math.max(ALL_BRANDS.length, 1)));
    const pool: OutProduct[] = [];
    for (const b of ALL_BRANDS) {
      const items = BY_BRAND.get(b) || [];
      if (items.length === 0) continue;
      // Fisher-Yates shuffle a copy so the same slice isn't returned every request
      const shuffled = fisherYates([...items]);
      pool.push(...shuffled.slice(0, perBrand));
    }
    return NextResponse.json({
      products: fisherYates(pool),
      total: pool.length,
      brands: ALL_BRANDS,
      totalProducts: CLEAN.length,
      totalBrands: ALL_BRANDS.length,
      mix: true,
    });
  }

  // ── Normal filtered query ───────────────────────────────────────
  let filtered: OutProduct[] = CLEAN;

  if (brand && brand !== 'All') {
    filtered = filtered.filter(p => p.brand === brand);
  }

  if (search) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(search)
      || p.brand.toLowerCase().includes(search)
      || p.type.toLowerCase().includes(search)
    );
  }

  // Sort
  const parsePrice = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;
  const sorted = [...filtered];
  switch (sortBy) {
    case 'price_asc':
      sorted.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
      break;
    case 'price_desc':
      sorted.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
      break;
    case 'brand':
      sorted.sort((a, b) => a.brand.localeCompare(b.brand));
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'random':
      fisherYates(sorted);
      break;
    case 'newest':
    default:
      // JSON has no timestamp — fall back to stable order
      break;
  }

  const total = sorted.length;
  const start = (page - 1) * limit;
  const paged = sorted.slice(start, start + limit);

  return NextResponse.json({
    products: paged,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    brands: ALL_BRANDS,
    totalProducts: CLEAN.length,
    totalBrands: ALL_BRANDS.length,
  });
}
