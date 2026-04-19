import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Products directory — scraped product catalog linked to brands by ID.
 *
 *   GET /api/products/list                         paginated product list
 *   GET /api/products/list?brand_id=37             all Warby Parker products
 *   GET /api/products/list?brand_handle=warbyparker  same, by handle
 *   GET /api/products/list?search=aviator          text search
 *   GET /api/products/list?min_price=50&max_price=200
 *   GET /api/products/list?page=2&limit=60
 *
 * Each product links back to tracked_brands.id + tracked_brands.handle.
 */

export const maxDuration = 20;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brandId = searchParams.get('brand_id');
  const brandHandle = searchParams.get('brand_handle');
  const search = searchParams.get('search');
  const minPrice = searchParams.get('min_price');
  const maxPrice = searchParams.get('max_price');
  const activeOnly = searchParams.get('active') !== '0';
  const sortBy = searchParams.get('sortBy') || 'recent';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '40')));

  const client = supabaseServer();

  let q = client.from('products').select('*', { count: 'exact' });
  if (brandId) q = q.eq('brand_id', parseInt(brandId));
  if (brandHandle) q = q.eq('brand_handle', brandHandle.toLowerCase());
  if (activeOnly) q = q.eq('is_active', true);
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`name.ilike.${s},brand.ilike.${s},product_type.ilike.${s}`);
  }
  if (minPrice) q = q.gte('price', parseFloat(minPrice));
  if (maxPrice) q = q.lte('price', parseFloat(maxPrice));

  switch (sortBy) {
    case 'price_asc':  q = q.order('price', { ascending: true, nullsFirst: false }); break;
    case 'price_desc': q = q.order('price', { ascending: false, nullsFirst: false }); break;
    case 'name':       q = q.order('name', { ascending: true }); break;
    case 'recent':
    default:           q = q.order('first_seen_at', { ascending: false, nullsFirst: false }); break;
  }

  q = q.range((page - 1) * limit, page * limit - 1);
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Brand context: if brand_id filter is set, resolve the brand details for the header
  let brand: Record<string, unknown> | null = null;
  if (brandId) {
    const { data: br } = await client
      .from('tracked_brands')
      .select('id,handle,name,category,region,price_range,website,logo_url,instagram_url')
      .eq('id', parseInt(brandId))
      .maybeSingle();
    brand = br;
  } else if (brandHandle) {
    const { data: br } = await client
      .from('tracked_brands')
      .select('id,handle,name,category,region,price_range,website,logo_url,instagram_url')
      .eq('handle', brandHandle.toLowerCase())
      .maybeSingle();
    brand = br;
  }

  // Top-brand facets (so the UI can show "filter by brand")
  const { data: topBrandsRaw } = await client
    .from('products')
    .select('brand_id,brand,brand_handle')
    .not('brand_id', 'is', null)
    .limit(5000);
  const brandCounts = new Map<number, { brand_id: number; brand: string; brand_handle: string; count: number }>();
  for (const r of (topBrandsRaw || []) as Array<{ brand_id: number; brand: string; brand_handle: string }>) {
    const entry = brandCounts.get(r.brand_id) || { brand_id: r.brand_id, brand: r.brand, brand_handle: r.brand_handle, count: 0 };
    entry.count++;
    brandCounts.set(r.brand_id, entry);
  }
  const topBrands = [...brandCounts.values()].sort((a, b) => b.count - a.count).slice(0, 50);

  return NextResponse.json({
    products: data || [],
    total: count || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
    brand,
    topBrands,
  });
}
