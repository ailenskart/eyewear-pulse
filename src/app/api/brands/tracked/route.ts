import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * CRUD for the `tracked_brands` table — the user-uploaded brand
 * list that feeds the rescrape cron.
 *
 *   GET    /api/brands/tracked                list with filters
 *   GET    /api/brands/tracked?handle=rayban  single brand
 *   DELETE /api/brands/tracked?handle=rayban  deactivate (soft delete)
 *   PATCH  /api/brands/tracked                update fields
 *
 * The read endpoint also returns the last 10 upload log entries so
 * the UI can show "uploaded 120 brands 3m ago".
 */

export const maxDuration = 15;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const handle = searchParams.get('handle');
  const category = searchParams.get('category');
  const region = searchParams.get('region');
  const tier = searchParams.get('tier');
  const activeOnly = searchParams.get('active') !== '0';
  const search = searchParams.get('search');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100')));

  const client = supabaseServer();

  if (handle) {
    const { data, error } = await client.from('tracked_brands').select('*').eq('handle', handle.toLowerCase()).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(data);
  }

  let q = client.from('tracked_brands').select('*', { count: 'exact' });
  if (activeOnly) q = q.eq('active', true);
  if (category && category !== 'All') q = q.eq('category', category);
  if (region && region !== 'All') q = q.eq('region', region);
  if (tier) q = q.eq('tier', tier);
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`handle.ilike.${s},name.ilike.${s},notes.ilike.${s}`);
  }
  q = q.order('added_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Enrich with posts_count + products_count ──
  const rows = (data || []) as Array<{ handle: string; name: string; [key: string]: unknown }>;
  const handles = rows.map(r => r.handle);
  const names = rows.map(r => r.name).filter(Boolean);

  // Post counts per brand_handle
  const postCounts = new Map<string, number>();
  if (handles.length > 0) {
    // Supabase doesn't expose GROUP BY directly — pull minimal rows and count in JS.
    const { data: postRows } = await client
      .from('ig_posts')
      .select('brand_handle')
      .in('brand_handle', handles);
    for (const r of (postRows || []) as Array<{ brand_handle: string }>) {
      postCounts.set(r.brand_handle, (postCounts.get(r.brand_handle) || 0) + 1);
    }
  }

  // Product counts per brand name (products.brand holds the display name)
  const productCounts = new Map<string, number>();
  if (names.length > 0) {
    const { data: productRows } = await client
      .from('products')
      .select('brand')
      .in('brand', names);
    for (const r of (productRows || []) as Array<{ brand: string }>) {
      const key = (r.brand || '').toLowerCase();
      productCounts.set(key, (productCounts.get(key) || 0) + 1);
    }
  }

  const enriched = rows.map(r => ({
    ...r,
    posts_count: postCounts.get(r.handle) || 0,
    products_count: productCounts.get((r.name || '').toLowerCase()) || 0,
  }));

  // Upload history
  const { data: uploads } = await client
    .from('brand_upload_log')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(10);

  // Facets
  const { data: facetsRaw } = await client.from('tracked_brands').select('category,region,tier').eq('active', true);
  const catMap = new Map<string, number>();
  const regMap = new Map<string, number>();
  const tierMap = new Map<string, number>();
  for (const r of (facetsRaw || []) as Array<{ category: string | null; region: string | null; tier: string | null }>) {
    if (r.category) catMap.set(r.category, (catMap.get(r.category) || 0) + 1);
    if (r.region) regMap.set(r.region, (regMap.get(r.region) || 0) + 1);
    if (r.tier) tierMap.set(r.tier, (tierMap.get(r.tier) || 0) + 1);
  }

  return NextResponse.json({
    brands: enriched,
    total: count || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
    uploads: uploads || [],
    facets: {
      categories: [...catMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      regions: [...regMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      tiers: [...tierMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    },
  });
}

export async function DELETE(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle');
  const hard = request.nextUrl.searchParams.get('hard') === '1';
  if (!handle) return NextResponse.json({ error: 'handle param required' }, { status: 400 });

  const client = supabaseServer();
  if (hard) {
    const { error } = await client.from('tracked_brands').delete().eq('handle', handle.toLowerCase());
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deleted: handle, hard: true });
  }
  const { error } = await client.from('tracked_brands').update({ active: false }).eq('handle', handle.toLowerCase());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deactivated: handle });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !body.handle) {
    return NextResponse.json({ error: 'body must include { handle, ...fields }' }, { status: 400 });
  }
  const { handle, ...rest } = body;
  const allowed: Record<string, unknown> = {};
  const editableFields = [
    'name', 'category', 'region', 'price_range', 'subcategory', 'country',
    'website', 'notes', 'tier', 'active',
    'instagram_url', 'facebook_url', 'twitter_url', 'tiktok_url', 'youtube_url', 'linkedin_url',
    'logo_url', 'founded_year', 'employee_count', 'hq_city',
    'details', 'people',
  ];
  for (const k of editableFields) {
    if (k in rest) allowed[k] = rest[k];
  }
  if ('people' in allowed) {
    allowed.people_updated_at = new Date().toISOString();
  }
  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'no updatable fields in body' }, { status: 400 });
  }

  const client = supabaseServer();
  const { error, data } = await client
    .from('tracked_brands')
    .update(allowed)
    .eq('handle', String(handle).toLowerCase())
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, brand: data });
}
