import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Celebrities feed — unified Instagram-style stream of celebrity
 * eyewear photos pulled from `celeb_photos`.
 *
 * This is the reverse of the per-celeb scanner: instead of "show
 * me all the photos of Rihanna wearing glasses", this endpoint
 * streams the latest vision-approved photos across ALL celebs
 * in one feed, newest first.
 *
 * Filters:
 *   - category   (Actor | Musician | Athlete | Tech | ...)
 *   - country    (US | UK | IN | ...)
 *   - celeb      (slug — show only one celebrity's feed)
 *   - eyewearType (sunglasses | eyeglasses)  (substring match)
 *   - search     (free text against caption / celeb_name)
 *
 * Returns paginated feed rows that mirror the shape of the main
 * IG feed so the UI can reuse the same `MediaCard` component.
 */

export const maxDuration = 30;

interface CelebPhotoRow {
  id: string;
  celeb_name: string;
  celeb_slug: string;
  celeb_category: string | null;
  celeb_country: string | null;
  image_url: string;
  blob_url: string | null;
  thumb_url: string | null;
  page_url: string | null;
  source: string | null;
  source_type: string | null;
  caption: string | null;
  eyewear_type: string | null;
  detected_at: string;
  likes: number;
  comments: number;
  posted_at: string | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category');
  const country = searchParams.get('country');
  const celeb = searchParams.get('celeb');
  const eyewearType = searchParams.get('eyewearType');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sortBy') || 'recent';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(60, Math.max(1, parseInt(searchParams.get('limit') || '30')));

  const client = supabaseServer();
  let q = client.from('celeb_photos').select('*', { count: 'exact' });

  if (category && category !== 'All') q = q.eq('celeb_category', category);
  if (country) q = q.eq('celeb_country', country);
  if (celeb) q = q.eq('celeb_slug', celeb.toLowerCase());
  if (eyewearType) q = q.ilike('eyewear_type', `%${eyewearType}%`);
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`caption.ilike.${s},celeb_name.ilike.${s},eyewear_type.ilike.${s}`);
  }

  switch (sortBy) {
    case 'likes':
      q = q.order('likes', { ascending: false, nullsFirst: false });
      break;
    case 'recent':
    default:
      q = q.order('detected_at', { ascending: false });
      break;
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  q = q.range(from, to);

  const { data, count, error } = await q;

  if (error) {
    return NextResponse.json({ posts: [], total: 0, page, totalPages: 0, error: error.message }, { status: 500 });
  }

  const rows = (data as CelebPhotoRow[] | null) || [];

  // Shape each row like the main feed's Post so the UI can reuse MediaCard.
  const posts = rows.map(r => ({
    id: r.id,
    brand: {
      name: r.celeb_name,
      handle: r.celeb_slug,
      category: 'Celebrity',
      region: r.celeb_country || '—',
      priceRange: '',
    },
    celebName: r.celeb_name,
    celebSlug: r.celeb_slug,
    celebCategory: r.celeb_category,
    celebCountry: r.celeb_country,
    imageUrl: r.blob_url || r.image_url,
    rawImageUrl: r.blob_url || r.image_url,
    thumbnail: r.thumb_url || r.image_url,
    videoUrl: null,
    carouselSlides: [] as Array<{ url: string; type: string }>,
    caption: r.caption || `${r.celeb_name} spotted in ${r.eyewear_type || 'eyewear'}`,
    eyewearType: r.eyewear_type || 'eyewear',
    sourceLabel: r.source || r.source_type || 'web',
    pageUrl: r.page_url || '',
    likes: r.likes || 0,
    comments: r.comments || 0,
    engagement: 0,
    hashtags: [] as string[],
    postedAt: r.detected_at,
    postUrl: r.page_url || '',
    type: 'Image',
    isVideo: false,
  }));

  // Get filter facets for the UI (category + country counts)
  const { data: facetsRaw } = await client
    .from('celeb_photos')
    .select('celeb_category,celeb_country')
    .limit(5000);
  const catMap = new Map<string, number>();
  const ctryMap = new Map<string, number>();
  for (const r of (facetsRaw || []) as Array<{ celeb_category: string | null; celeb_country: string | null }>) {
    if (r.celeb_category) catMap.set(r.celeb_category, (catMap.get(r.celeb_category) || 0) + 1);
    if (r.celeb_country) ctryMap.set(r.celeb_country, (ctryMap.get(r.celeb_country) || 0) + 1);
  }
  const facets = {
    categories: [...catMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    countries: [...ctryMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
  };

  // Last scan time
  const { data: lastScan } = await client
    .from('celeb_scan_log')
    .select('celeb_name,scanned_at,detected')
    .order('scanned_at', { ascending: false })
    .limit(1);

  return NextResponse.json({
    posts,
    total: count || rows.length,
    page,
    totalPages: Math.max(1, Math.ceil((count || rows.length) / limit)),
    facets,
    lastScan: lastScan && lastScan[0] ? lastScan[0] : null,
  });
}
