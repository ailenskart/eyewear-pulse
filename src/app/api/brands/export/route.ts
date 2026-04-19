import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Unified brand export — downloads tracked_brands + all linked
 * brand_content rows in one payload.
 *
 *   GET /api/brands/export?brand_id=37           one brand
 *   GET /api/brands/export?handle=warbyparker    by handle
 *   GET /api/brands/export                       all brands summary
 *   GET /api/brands/export?format=csv            CSV
 *   GET /api/brands/export?type=ig_post          filter content by type
 */

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brandIdParam = searchParams.get('brand_id');
  const handleParam = searchParams.get('handle');
  const format = searchParams.get('format') || 'json';
  const typeFilter = searchParams.get('type');

  const client = supabaseServer();

  // ── Single brand deep export ──
  if (brandIdParam || handleParam) {
    let brandQuery = client.from('tracked_brands').select('*');
    if (brandIdParam) brandQuery = brandQuery.eq('id', parseInt(brandIdParam));
    else if (handleParam) brandQuery = brandQuery.eq('handle', handleParam.toLowerCase());
    const { data: brand } = await brandQuery.maybeSingle();
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    const bid = (brand as { id: number }).id;

    let contentQuery = client.from('brand_content').select('*').eq('brand_id', bid).eq('is_active', true);
    if (typeFilter) contentQuery = contentQuery.eq('type', typeFilter);
    const { data: content } = await contentQuery.order('posted_at', { ascending: false, nullsFirst: false }).limit(5000);

    const rows = (content || []) as Array<{ type: string }>;
    const byType: Record<string, typeof rows> = {};
    for (const r of rows) {
      if (!byType[r.type]) byType[r.type] = [];
      byType[r.type].push(r);
    }
    const counts: Record<string, number> = {};
    for (const t of Object.keys(byType)) counts[t] = byType[t].length;

    const payload = { brand, content: rows, by_type: byType, counts, exported_at: new Date().toISOString() };

    if (format === 'csv') return buildDeepCsv(brand as Record<string, unknown>, rows as unknown as Array<Record<string, unknown>>);
    return NextResponse.json(payload);
  }

  // ── All brands summary ──
  const { data: brands } = await client
    .from('tracked_brands')
    .select('id,handle,name,category,region,country,iso_code,website,instagram_url,facebook_url,twitter_url,linkedin_url,youtube_url,tiktok_url,parent_company,ownership_type,is_public,stock_ticker,price_range,employee_count,store_count,ceo_name,active,tier')
    .order('id', { ascending: true });

  const { data: countsRaw } = await client
    .from('brand_content')
    .select('brand_id,type')
    .eq('is_active', true)
    .limit(50000);

  // Aggregate in-memory: brand_id → { type: count }
  const agg = new Map<number, Record<string, number>>();
  for (const r of (countsRaw || []) as Array<{ brand_id: number; type: string }>) {
    if (!r.brand_id) continue;
    if (!agg.has(r.brand_id)) agg.set(r.brand_id, {});
    const m = agg.get(r.brand_id)!;
    m[r.type] = (m[r.type] || 0) + 1;
  }

  const enriched = (brands || []).map(b => {
    const c = agg.get((b as { id: number }).id) || {};
    return {
      ...(b as Record<string, unknown>),
      ig_posts: c.ig_post || 0,
      products: c.product || 0,
      celeb_photos: c.celeb_photo || 0,
      people: c.person || 0,
      reimagines: c.reimagine || 0,
      youtube: c.youtube || 0,
      tiktok: c.tiktok || 0,
      total_content: Object.values(c).reduce((s, n) => s + n, 0),
    };
  });

  if (format === 'csv') return buildSummaryCsv(enriched);
  return NextResponse.json({ brands: enriched, total: enriched.length, exported_at: new Date().toISOString() });
}

/* ─── CSV builders ─── */

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (Array.isArray(v)) s = v.join(';');
  else if (typeof v === 'boolean') s = v ? 'yes' : 'no';
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildSummaryCsv(brands: Array<Record<string, unknown>>): NextResponse {
  const headers = ['id','handle','name','category','region','country','iso_code','website','instagram_url','facebook_url','twitter_url','linkedin_url','youtube_url','tiktok_url','parent_company','ownership_type','is_public','stock_ticker','price_range','employee_count','store_count','ceo_name','active','tier','ig_posts','products','celeb_photos','people','reimagines','youtube','tiktok','total_content'];
  const rows = [headers.join(',')];
  for (const b of brands) rows.push(headers.map(h => esc(b[h])).join(','));
  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="lenzy-brands-full-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}

function buildDeepCsv(brand: Record<string, unknown>, content: Array<Record<string, unknown>>): NextResponse {
  const handle = String(brand.handle || 'brand');
  const lines: string[] = [];

  // Brand profile block
  lines.push('=== BRAND PROFILE ===');
  const brandKeys = Object.keys(brand).filter(k => !['details','people'].includes(k));
  lines.push(brandKeys.join(','));
  lines.push(brandKeys.map(k => esc(brand[k])).join(','));
  lines.push('');

  // Content block (all types in one flat table)
  lines.push(`=== CONTENT (${content.length} rows) ===`);
  const contentKeys = ['id','type','parent_id','title','caption','description','url','image_url','blob_url','video_url','likes','comments','views','shares','engagement','price','compare_price','currency','person_name','person_title','linkedin_url','email','location','department','seniority','posted_at','detected_at','tags','hashtags','product_type','eyewear_type','source','source_ref'];
  lines.push(contentKeys.join(','));
  for (const c of content) lines.push(contentKeys.map(k => esc(c[k])).join(','));

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="lenzy-${handle}-full-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
