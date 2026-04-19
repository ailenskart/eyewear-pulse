import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Unified brand export — download one or all brands with ALL
 * linked data in a single payload.
 *
 * Returns:
 *   - brand profile (full tracked_brands row)
 *   - products[]      (from products table, by brand_id)
 *   - ig_posts[]      (from ig_posts table, by brand_id)
 *   - celeb_photos[]  (from celeb_photos, by brand_id)
 *   - people[]        (from directory_people, where brand_id in brand_ids)
 *
 * Usage:
 *   GET /api/brands/export?brand_id=37           one brand
 *   GET /api/brands/export?handle=warbyparker    by handle
 *   GET /api/brands/export                       all brands summary
 *   GET /api/brands/export?format=csv            CSV flat export (summary)
 *   GET /api/brands/export?brand_id=37&format=csv  CSV for one brand
 */

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brandIdParam = searchParams.get('brand_id');
  const handleParam = searchParams.get('handle');
  const format = searchParams.get('format') || 'json';
  const includeProducts = searchParams.get('products') !== '0';
  const includePosts = searchParams.get('posts') !== '0';
  const includeCelebs = searchParams.get('celebs') !== '0';
  const includePeople = searchParams.get('people') !== '0';

  const client = supabaseServer();

  // ── Single brand deep export ──
  if (brandIdParam || handleParam) {
    let brandQuery = client.from('tracked_brands').select('*');
    if (brandIdParam) brandQuery = brandQuery.eq('id', parseInt(brandIdParam));
    else if (handleParam) brandQuery = brandQuery.eq('handle', handleParam.toLowerCase());
    const { data: brand } = await brandQuery.maybeSingle();

    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    const bid = (brand as { id: number }).id;

    // Fetch all linked data in parallel
    const [productsRes, postsRes, celebsRes, peopleRes] = await Promise.all([
      includeProducts
        ? client.from('products').select('id,name,price,compare_price,currency,product_type,product_url,image_url,is_active,first_seen_at,last_seen_at').eq('brand_id', bid).order('first_seen_at', { ascending: false }).limit(1000)
        : Promise.resolve({ data: null }),
      includePosts
        ? client.from('ig_posts').select('id,caption,likes,comments,engagement,post_type,post_url,image_url,blob_url,is_video,hashtags,posted_at').eq('brand_id', bid).order('posted_at', { ascending: false }).limit(500)
        : Promise.resolve({ data: null }),
      includeCelebs
        ? client.from('celeb_photos').select('id,celeb_name,celeb_slug,image_url,blob_url,page_url,eyewear_type,source,detected_at,likes').eq('brand_id', bid).order('detected_at', { ascending: false }).limit(200)
        : Promise.resolve({ data: null }),
      includePeople
        ? client.from('directory_people').select('id,name,title,department,seniority,company_current,linkedin_url,photo_url,email,location,tenure,brand_ids,brand_handles').contains('brand_ids', [bid])
        : Promise.resolve({ data: null }),
    ]);

    const payload = {
      brand,
      products: productsRes.data || [],
      ig_posts: postsRes.data || [],
      celeb_photos: celebsRes.data || [],
      people: peopleRes.data || [],
      counts: {
        products: (productsRes.data || []).length,
        ig_posts: (postsRes.data || []).length,
        celeb_photos: (celebsRes.data || []).length,
        people: (peopleRes.data || []).length,
      },
      exported_at: new Date().toISOString(),
    };

    if (format === 'csv') {
      return buildCsvResponse(payload);
    }
    return NextResponse.json(payload);
  }

  // ── All brands summary export ──
  const { data: summary } = await client
    .from('brand_summary')
    .select('*')
    .order('id', { ascending: true });

  if (format === 'csv') {
    return buildSummaryCsv(summary || []);
  }

  return NextResponse.json({
    brands: summary || [],
    total: (summary || []).length,
    exported_at: new Date().toISOString(),
  });
}

/* ─── CSV builders ─── */

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (Array.isArray(v)) s = v.join(';');
  else if (typeof v === 'boolean') s = v ? 'yes' : 'no';
  else s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildSummaryCsv(brands: Array<Record<string, unknown>>): NextResponse {
  const headers = ['id','handle','name','category','region','country','iso_code','website','instagram_url','facebook_url','twitter_url','linkedin_url','youtube_url','tiktok_url','parent_company','ownership_type','is_public','stock_ticker','price_range','employee_count','store_count','ceo_name','active','tier','ig_posts_count','products_count','celeb_photos_count','people_count'];
  const rows = [headers.join(',')];
  for (const b of brands) {
    rows.push(headers.map(h => esc(b[h])).join(','));
  }
  const csv = rows.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="lenzy-brands-full-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}

function buildCsvResponse(payload: {
  brand: Record<string, unknown>;
  products: Array<Record<string, unknown>>;
  ig_posts: Array<Record<string, unknown>>;
  celeb_photos: Array<Record<string, unknown>>;
  people: Array<Record<string, unknown>>;
}): NextResponse {
  const b = payload.brand;
  const handle = String(b.handle || 'brand');

  // Multi-sheet CSV: one block per entity type, separated by blank lines + header
  const lines: string[] = [];

  // Brand profile
  lines.push('=== BRAND PROFILE ===');
  const brandKeys = Object.keys(b).filter(k => !['details','people'].includes(k));
  lines.push(brandKeys.join(','));
  lines.push(brandKeys.map(k => esc(b[k])).join(','));
  lines.push('');

  // Products
  if (payload.products.length > 0) {
    lines.push(`=== PRODUCTS (${payload.products.length}) ===`);
    const ph = ['id','name','price','compare_price','currency','product_type','product_url','image_url','is_active','first_seen_at','last_seen_at'];
    lines.push(ph.join(','));
    for (const p of payload.products) lines.push(ph.map(k => esc(p[k])).join(','));
    lines.push('');
  }

  // Instagram posts
  if (payload.ig_posts.length > 0) {
    lines.push(`=== INSTAGRAM POSTS (${payload.ig_posts.length}) ===`);
    const ih = ['id','caption','likes','comments','engagement','post_type','post_url','image_url','is_video','posted_at'];
    lines.push(ih.join(','));
    for (const p of payload.ig_posts) lines.push(ih.map(k => esc(p[k])).join(','));
    lines.push('');
  }

  // Celebrity photos
  if (payload.celeb_photos.length > 0) {
    lines.push(`=== CELEBRITY PHOTOS (${payload.celeb_photos.length}) ===`);
    const ch = ['id','celeb_name','celeb_slug','eyewear_type','source','page_url','image_url','detected_at','likes'];
    lines.push(ch.join(','));
    for (const c of payload.celeb_photos) lines.push(ch.map(k => esc(c[k])).join(','));
    lines.push('');
  }

  // People
  if (payload.people.length > 0) {
    lines.push(`=== PEOPLE (${payload.people.length}) ===`);
    const peh = ['id','name','title','department','seniority','company_current','linkedin_url','email','location','tenure','brand_ids'];
    lines.push(peh.join(','));
    for (const p of payload.people) lines.push(peh.map(k => esc(p[k])).join(','));
  }

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="lenzy-${handle}-full-export-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
