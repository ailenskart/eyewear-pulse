import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sortBy') || 'price_asc';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '40');
  const show = searchParams.get('show') || 'active'; // active | new | delisted | all

  // Build query
  let query = supabase.from('products').select('*', { count: 'exact' });

  // Filter by status
  if (show === 'active') {
    query = query.eq('is_active', true);
  } else if (show === 'delisted') {
    query = query.eq('is_active', false);
  } else if (show === 'new') {
    // Products first seen in the last 7 days
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    query = query.gte('first_seen_at', weekAgo).eq('is_active', true);
  }

  if (brand && brand !== 'All') {
    query = query.eq('brand', brand);
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%,product_type.ilike.%${search}%`);
  }

  // Sort
  switch (sortBy) {
    case 'price_asc': query = query.order('price', { ascending: true }); break;
    case 'price_desc': query = query.order('price', { ascending: false }); break;
    case 'brand': query = query.order('brand', { ascending: true }); break;
    case 'name': query = query.order('name', { ascending: true }); break;
    case 'newest': query = query.order('first_seen_at', { ascending: false }); break;
  }

  // Paginate
  const start = (page - 1) * limit;
  query = query.range(start, start + limit - 1);

  const { data: products, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get brand list
  const { data: brandRows } = await supabase
    .from('products')
    .select('brand')
    .eq('is_active', true)
    .order('brand');
  const brands = [...new Set((brandRows || []).map(r => r.brand))];

  // Get price analytics
  // Price stats computed below from query results

  // Fallback price stats from simple queries
  const { data: avgByBrand } = await supabase
    .from('products')
    .select('brand')
    .eq('is_active', true)
    .order('brand');

  // Compute stats from products
  const brandStats = new Map<string, { count: number; total: number; min: number; max: number }>();
  const priceRanges = { under25: 0, '25to50': 0, '50to100': 0, '100to200': 0, over200: 0 };

  // Get all products for stats (we'll cache this later)
  const { data: allProducts } = await supabase
    .from('products')
    .select('brand,price')
    .eq('is_active', true)
    .gt('price', 0);

  (allProducts || []).forEach(p => {
    const price = Number(p.price);
    if (price < 25) priceRanges.under25++;
    else if (price < 50) priceRanges['25to50']++;
    else if (price < 100) priceRanges['50to100']++;
    else if (price < 200) priceRanges['100to200']++;
    else priceRanges.over200++;

    const s = brandStats.get(p.brand) || { count: 0, total: 0, min: Infinity, max: 0 };
    s.count++;
    s.total += price;
    if (price < s.min) s.min = price;
    if (price > s.max) s.max = price;
    brandStats.set(p.brand, s);
  });

  const avgByBrandResult = [...brandStats.entries()].map(([brand, s]) => ({
    brand,
    products: s.count,
    avgPrice: Math.round(s.total / s.count),
    minPrice: s.min === Infinity ? 0 : Math.round(s.min),
    maxPrice: Math.round(s.max),
  })).sort((a, b) => a.avgPrice - b.avgPrice);

  // Count new (last 7 days) and delisted
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count: newCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .gte('first_seen_at', weekAgo)
    .eq('is_active', true);

  const { count: delistedCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', false);

  const { count: totalActive } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  return NextResponse.json({
    products: (products || []).map(p => ({
      ...p,
      price: p.price ? `$${Number(p.price).toFixed(2)}` : '',
      comparePrice: p.compare_price && Number(p.compare_price) > 0 ? `$${Number(p.compare_price).toFixed(2)}` : '',
      image: p.image_url || p.blob_url || '',
      type: p.product_type || 'Eyewear',
      url: p.product_url,
      isNew: p.first_seen_at && new Date(p.first_seen_at) > new Date(weekAgo),
      isDelisted: !p.is_active,
    })),
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
    brands,
    priceRanges,
    avgByBrand: avgByBrandResult,
    stats: {
      totalActive: totalActive || 0,
      newThisWeek: newCount || 0,
      delisted: delistedCount || 0,
      totalBrands: brands.length,
    },
  });
}
