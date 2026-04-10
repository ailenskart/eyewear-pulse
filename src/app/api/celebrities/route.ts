import { NextRequest, NextResponse } from 'next/server';
import celebritiesData from '@/data/celebrities.json';
import { runActor, isApifyConfigured, DEFAULT_ACTORS } from '@/lib/apify';

/**
 * Celebrities wearing eyewear.
 *
 * Seed list is in src/data/celebrities.json (~160 curated celebs
 * across Actors/Musicians/Athletes/Tech/Royalty/Characters +
 * heavy India coverage). Each celeb has a 'knownFor' blurb that
 * names their signature frames.
 *
 * Image fetching is lazy per celeb:
 *   1. Brave Image Search (free 2k/mo) — primary if BRAVE_SEARCH_KEY
 *   2. Apify google-images-scraper — fallback if APIFY_TOKEN
 *   3. Wikipedia thumbnail — free, always works but only gives a
 *      portrait (not specifically eyewear)
 *
 * Results cached in-memory per celeb for 7 days.
 *
 * Usage:
 *   GET /api/celebrities                            (list all)
 *   GET /api/celebrities?category=Actor             (filtered list)
 *   GET /api/celebrities?q=Rihanna                  (search)
 *   GET /api/celebrities?name=Virat+Kohli&images=1  (fetch images)
 */

export const maxDuration = 60;

interface Celebrity {
  name: string;
  category: string;
  country: string;
  knownFor: string;
}

interface CelebrityImages {
  name: string;
  images: Array<{ url: string; source?: string; thumb?: string; title?: string }>;
  wikipedia?: string;
  fetchedAt: string;
  source: 'brave' | 'apify' | 'wikipedia' | 'none';
}

const ALL: Celebrity[] = celebritiesData as Celebrity[];

// In-memory image cache
const IMAGE_CACHE = new Map<string, { payload: CelebrityImages; expiresAt: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const BRAVE_KEY = process.env.BRAVE_SEARCH_KEY || '';

async function fetchViaBrave(name: string): Promise<CelebrityImages | null> {
  if (!BRAVE_KEY) return null;
  try {
    const q = `${name} eyewear sunglasses OR eyeglasses`;
    const url = new URL('https://api.search.brave.com/res/v1/images/search');
    url.searchParams.set('q', q);
    url.searchParams.set('count', '12');
    url.searchParams.set('safesearch', 'strict');
    const res = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_KEY,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results || [];
    return {
      name,
      images: results.slice(0, 12).map((r: Record<string, unknown>) => ({
        url: (r.url as string) || ((r.properties as { url?: string })?.url as string),
        thumb: (r.thumbnail as { src?: string })?.src || (r.properties as { url?: string })?.url,
        title: r.title as string | undefined,
        source: (r.source as string) || ((r.meta_url as { hostname?: string })?.hostname as string),
      })).filter((i: { url: string }) => i.url),
      fetchedAt: new Date().toISOString(),
      source: 'brave',
    };
  } catch {
    return null;
  }
}

async function fetchViaApify(name: string): Promise<CelebrityImages | null> {
  if (!isApifyConfigured()) return null;
  try {
    const input = {
      queries: `${name} sunglasses\n${name} eyeglasses`,
      maxPagesPerQuery: 1,
      resultsPerPage: 12,
      customDataFunction: undefined,
    };
    const result = await runActor<Record<string, unknown>>(DEFAULT_ACTORS.googleShopping.replace('shopping', 'images-scraper'), input, { timeout: 45, maxItems: 20 });
    if (!result.ok) return null;
    return {
      name,
      images: result.items.slice(0, 12).map(i => ({
        url: (i.imageUrl as string) || (i.image as string) || (i.url as string),
        thumb: (i.thumbnailUrl as string) || (i.thumbnail as string),
        title: i.title as string | undefined,
        source: i.source as string | undefined,
      })).filter(i => i.url),
      fetchedAt: new Date().toISOString(),
      source: 'apify',
    };
  } catch {
    return null;
  }
}

async function fetchViaWikipedia(name: string): Promise<CelebrityImages | null> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`, {
      headers: { 'User-Agent': 'Lenzy/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const images: CelebrityImages['images'] = [];
    if (data?.thumbnail?.source) {
      images.push({
        url: data.thumbnail.source.replace(/\/\d+px-/, '/600px-'),
        thumb: data.thumbnail.source,
        title: data.displaytitle || name,
        source: 'Wikipedia',
      });
    }
    return {
      name,
      images,
      wikipedia: data?.content_urls?.desktop?.page,
      fetchedAt: new Date().toISOString(),
      source: images.length > 0 ? 'wikipedia' : 'none',
    };
  } catch {
    return null;
  }
}

async function fetchImagesForCeleb(name: string): Promise<CelebrityImages> {
  const cacheKey = name.toLowerCase();
  const now = Date.now();
  const cached = IMAGE_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.payload;

  // Try Brave, then Apify, then Wikipedia
  let result = await fetchViaBrave(name);
  if (!result || result.images.length === 0) result = await fetchViaApify(name);
  if (!result || result.images.length === 0) result = await fetchViaWikipedia(name);
  if (!result) result = { name, images: [], fetchedAt: new Date().toISOString(), source: 'none' };

  IMAGE_CACHE.set(cacheKey, { payload: result, expiresAt: now + CACHE_TTL });
  return result;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const name = searchParams.get('name');
  const wantImages = searchParams.get('images') === '1';
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  const category = searchParams.get('category');
  const country = searchParams.get('country');
  const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);

  // ── Image lookup for one celeb ──
  if (name && wantImages) {
    const images = await fetchImagesForCeleb(name);
    return NextResponse.json(images);
  }

  // ── Catalog listing ──
  let filtered = ALL;
  if (q) filtered = filtered.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.category.toLowerCase().includes(q) ||
    c.knownFor.toLowerCase().includes(q)
  );
  if (category) filtered = filtered.filter(c => c.category.toLowerCase() === category.toLowerCase());
  if (country) filtered = filtered.filter(c => c.country.toLowerCase() === country.toLowerCase());

  const categories = [...new Set(ALL.map(c => c.category))].sort();
  const countries = [...new Set(ALL.map(c => c.country))].sort();

  return NextResponse.json({
    total: filtered.length,
    totalAll: ALL.length,
    celebrities: filtered.slice(0, limit),
    categories,
    countries,
    imageSourcesConfigured: {
      brave: !!BRAVE_KEY,
      apify: isApifyConfigured(),
      wikipedia: true,
    },
  });
}
