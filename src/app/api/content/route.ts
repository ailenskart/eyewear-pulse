import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * brand_content — the unified polymorphic content table.
 *
 * Every piece of content (IG post, product, person, celeb photo,
 * reimagine, YouTube video, TikTok post, website link, ad, news
 * mention) lives as a row here with a `type` column identifying
 * what it is, all linked to tracked_brands.id via brand_id.
 *
 *   GET    /api/content                                list (filter by type, brand, parent)
 *   GET    /api/content?id=123                         single row (with children)
 *   POST   /api/content                                create one row
 *   PATCH  /api/content                                update by { id, ...fields }
 *   DELETE /api/content?id=123                         hard delete
 *
 * Filters:
 *   ?brand_id=37       all content for Warby Parker
 *   ?type=ig_post      only IG posts
 *   ?type=person       only people
 *   ?parent_id=1234    children of a row (e.g. reimagines of a post)
 *   ?search=aviator    text search across title + caption + description
 *   ?tags=luxury,threat
 */

export const maxDuration = 20;

const VALID_TYPES = new Set([
  'ig_post', 'product', 'person', 'celeb_photo', 'reimagine',
  'tiktok', 'youtube', 'website_link', 'ad', 'news', 'linkedin_post',
  'facebook_post', 'x_post', 'other',
]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get('id');
  const brandId = searchParams.get('brand_id');
  const brandHandle = searchParams.get('brand_handle');
  const type = searchParams.get('type');
  const parentId = searchParams.get('parent_id');
  const search = searchParams.get('search');
  const tagsParam = searchParams.get('tags');
  const sortBy = searchParams.get('sortBy') || 'posted_at';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '60')));

  const client = supabaseServer();

  if (id) {
    const { data, error } = await client.from('brand_content').select('*').eq('id', parseInt(id)).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    // Fetch children too (e.g. reimagines)
    const { data: children } = await client.from('brand_content').select('*').eq('parent_id', parseInt(id)).order('detected_at', { ascending: false });
    return NextResponse.json({ content: data, children: children || [] });
  }

  let q = client.from('brand_content').select('*', { count: 'exact' }).eq('is_active', true);
  if (brandId) q = q.eq('brand_id', parseInt(brandId));
  if (brandHandle) q = q.eq('brand_handle', brandHandle.toLowerCase());
  if (type) q = q.eq('type', type);
  if (parentId) q = q.eq('parent_id', parseInt(parentId));
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`title.ilike.${s},caption.ilike.${s},description.ilike.${s},person_name.ilike.${s}`);
  }
  if (tagsParam) {
    const tagArray = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
    if (tagArray.length > 0) q = q.overlaps('tags', tagArray);
  }

  switch (sortBy) {
    case 'likes':       q = q.order('likes', { ascending: false, nullsFirst: false }); break;
    case 'engagement':  q = q.order('engagement', { ascending: false, nullsFirst: false }); break;
    case 'price_asc':   q = q.order('price', { ascending: true, nullsFirst: false }); break;
    case 'price_desc':  q = q.order('price', { ascending: false, nullsFirst: false }); break;
    case 'detected_at': q = q.order('detected_at', { ascending: false }); break;
    case 'posted_at':
    default:            q = q.order('posted_at', { ascending: false, nullsFirst: false }).order('detected_at', { ascending: false }); break;
  }

  q = q.range((page - 1) * limit, page * limit - 1);
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Type breakdown for the selected filter (if no type filter, show the breakdown)
  let typeBreakdown: Array<{ name: string; count: number }> = [];
  if (!type) {
    const facetsQuery = client.from('brand_content').select('type').eq('is_active', true);
    if (brandId) facetsQuery.eq('brand_id', parseInt(brandId));
    const { data: facetsRaw } = await facetsQuery.limit(10000);
    const m = new Map<string, number>();
    for (const r of (facetsRaw || []) as Array<{ type: string }>) m.set(r.type, (m.get(r.type) || 0) + 1);
    typeBreakdown = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }

  return NextResponse.json({
    content: data || [],
    total: count || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
    typeBreakdown,
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON body required' }, { status: 400 }); }

  const type = String(body.type || '').trim();
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: `Invalid type. Use one of: ${[...VALID_TYPES].join(', ')}` }, { status: 400 });
  }
  if (!body.brand_id && !body.brand_handle) {
    return NextResponse.json({ error: 'brand_id or brand_handle is required' }, { status: 400 });
  }

  const client = supabaseServer();

  // Resolve brand_id from handle if needed
  let brandId = body.brand_id ? parseInt(String(body.brand_id)) : null;
  let brandHandle = body.brand_handle ? String(body.brand_handle).toLowerCase() : null;
  if (!brandId && brandHandle) {
    const { data: tb } = await client.from('tracked_brands').select('id').eq('handle', brandHandle).maybeSingle();
    if (!tb) return NextResponse.json({ error: `Brand @${brandHandle} not found` }, { status: 404 });
    brandId = (tb as { id: number }).id;
  } else if (brandId && !brandHandle) {
    const { data: tb } = await client.from('tracked_brands').select('handle').eq('id', brandId).maybeSingle();
    brandHandle = tb ? (tb as { handle: string }).handle : null;
  }

  const tagsArr = (arr: unknown): string[] | null => {
    if (Array.isArray(arr)) return (arr as unknown[]).map(t => String(t).trim()).filter(Boolean);
    if (typeof arr === 'string') return arr.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
    return null;
  };

  const row = {
    brand_id: brandId,
    brand_handle: brandHandle,
    type,
    parent_id: body.parent_id ? parseInt(String(body.parent_id)) : null,
    title: body.title ? String(body.title) : null,
    caption: body.caption ? String(body.caption) : null,
    description: body.description ? String(body.description) : null,
    url: body.url ? String(body.url) : null,
    image_url: body.image_url ? String(body.image_url) : null,
    blob_url: body.blob_url ? String(body.blob_url) : null,
    video_url: body.video_url ? String(body.video_url) : null,
    thumbnail_url: body.thumbnail_url ? String(body.thumbnail_url) : null,
    likes: body.likes != null ? Number(body.likes) : 0,
    comments: body.comments != null ? Number(body.comments) : 0,
    views: body.views != null ? Number(body.views) : 0,
    shares: body.shares != null ? Number(body.shares) : 0,
    engagement: body.engagement != null ? Number(body.engagement) : null,
    price: body.price != null && body.price !== '' ? Number(body.price) : null,
    compare_price: body.compare_price != null && body.compare_price !== '' ? Number(body.compare_price) : null,
    currency: body.currency ? String(body.currency) : null,
    person_name: body.person_name ? String(body.person_name) : null,
    person_title: body.person_title ? String(body.person_title) : null,
    linkedin_url: body.linkedin_url ? String(body.linkedin_url) : null,
    email: body.email ? String(body.email) : null,
    phone: body.phone ? String(body.phone) : null,
    location: body.location ? String(body.location) : null,
    department: body.department ? String(body.department) : null,
    seniority: body.seniority ? String(body.seniority) : null,
    posted_at: body.posted_at ? String(body.posted_at) : null,
    tags: tagsArr(body.tags),
    hashtags: tagsArr(body.hashtags),
    product_type: body.product_type ? String(body.product_type) : null,
    eyewear_type: body.eyewear_type ? String(body.eyewear_type) : null,
    data: (body.data && typeof body.data === 'object') ? body.data : {},
    source: body.source ? String(body.source) : 'manual',
    source_ref: body.source_ref ? String(body.source_ref) : null,
    is_active: body.is_active === false ? false : true,
  };

  const { data, error } = await client.from('brand_content').insert(row).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, content: data });
}

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON body required' }, { status: 400 }); }

  const id = body.id ? parseInt(String(body.id)) : null;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { id: _discard, ...fields } = body;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const editable = ['brand_id','brand_handle','type','parent_id','title','caption','description','url','image_url','blob_url','video_url','thumbnail_url','likes','comments','views','shares','engagement','price','compare_price','currency','person_name','person_title','linkedin_url','email','phone','location','department','seniority','posted_at','tags','hashtags','product_type','eyewear_type','data','source','source_ref','is_active'];
  for (const k of editable) {
    if (k in fields) updates[k] = fields[k];
  }

  const client = supabaseServer();
  const { data, error } = await client.from('brand_content').update(updates).eq('id', id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, content: data });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 });
  const client = supabaseServer();
  const { error } = await client.from('brand_content').delete().eq('id', parseInt(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: parseInt(id) });
}
