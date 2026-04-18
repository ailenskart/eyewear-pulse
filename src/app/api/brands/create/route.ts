import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Create or update a single brand with full profile — socials, JSON details,
 * optional people list from LinkedIn.
 *
 * Use this endpoint when the user is adding a brand via the UI form. For
 * bulk imports (CSV/JSON/text), use /api/brands/upload.
 *
 * Body shape:
 * {
 *   handle: "rayban",                    // required — IG handle is the PK
 *   name: "Ray-Ban",
 *   category?: "Luxury",
 *   region?: "Europe",
 *   price_range?: "$$$",
 *   subcategory?: "Both",
 *   country?: "Italy",
 *   tier?: "fast" | "mid" | "full",
 *   // Social links (any subset — UI sends URLs, we accept raw handles too)
 *   instagram_url?: "https://instagram.com/rayban",
 *   facebook_url?:  "https://facebook.com/rayban",
 *   twitter_url?:   "https://x.com/ray_ban",
 *   tiktok_url?:    "https://tiktok.com/@rayban",
 *   youtube_url?:   "https://youtube.com/@rayban",
 *   linkedin_url?:  "https://linkedin.com/company/ray-ban",
 *   website?:       "https://ray-ban.com",
 *   // Full profile
 *   logo_url?:       "https://...",
 *   founded_year?:   1937,
 *   employee_count?: 5000,
 *   hq_city?:        "Milan",
 *   notes?:          "Acquired by EssilorLuxottica in 1999",
 *   details?: { ... any JSON ... },      // free-form extra data
 *   people?: [ { name, title, linkedin_url, photo_url, tenure } ],
 * }
 *
 *   POST /api/brands/create          (create or full upsert)
 *   PUT  /api/brands/create          (same as POST — explicit upsert)
 */

export const maxDuration = 15;

function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/\/$/, '')
    .replace(/\?.*$/, '')
    .replace(/\s+/g, '');
}

function normalizeUrl(raw: string | undefined | null, prefix: string): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  // Accept bare handles
  const clean = trimmed.replace(/^@/, '').replace(/\/$/, '');
  return `${prefix}${clean}`;
}

function titlecase(s: string): string {
  return s.replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ').filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

interface PersonInput {
  name?: unknown;
  title?: unknown;
  linkedin_url?: unknown;
  photo_url?: unknown;
  tenure?: unknown;
  location?: unknown;
}

async function upsertBrand(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 });
  }

  const rawHandle = (body.handle as string) || '';
  const handle = normalizeHandle(rawHandle);
  if (!handle) return NextResponse.json({ error: 'handle is required.' }, { status: 400 });
  if (handle.length > 50) return NextResponse.json({ error: 'handle too long.' }, { status: 400 });

  const tierInput = String(body.tier || 'full').toLowerCase();
  const tier = ['fast', 'mid', 'full'].includes(tierInput) ? tierInput : 'full';

  // Normalize people array
  const peopleRaw = Array.isArray(body.people) ? body.people as PersonInput[] : [];
  const people = peopleRaw.map(p => ({
    name: String(p.name || '').trim(),
    title: String(p.title || '').trim(),
    linkedin_url: String(p.linkedin_url || '').trim() || null,
    photo_url: String(p.photo_url || '').trim() || null,
    tenure: p.tenure ? String(p.tenure).trim() : null,
    location: p.location ? String(p.location).trim() : null,
  })).filter(p => p.name);

  const row = {
    handle,
    name: String(body.name || '').trim() || titlecase(handle),
    category: body.category ? String(body.category).trim() : null,
    region: body.region ? String(body.region).trim() : null,
    price_range: body.price_range ? String(body.price_range).trim() : null,
    subcategory: body.subcategory ? String(body.subcategory).trim() : null,
    country: body.country ? String(body.country).trim() : null,
    source_country: body.source_country ? String(body.source_country).trim() : null,
    hq_city: body.hq_city ? String(body.hq_city).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    tier,
    active: body.active === false ? false : true,
    source: 'manual',
    // Social URLs — accept both full URLs and bare handles
    instagram_url: normalizeUrl(body.instagram_url as string, 'https://instagram.com/') || `https://instagram.com/${handle}`,
    facebook_url: normalizeUrl(body.facebook_url as string, 'https://facebook.com/'),
    twitter_url: normalizeUrl(body.twitter_url as string, 'https://x.com/'),
    tiktok_url: normalizeUrl(body.tiktok_url as string, 'https://tiktok.com/@'),
    youtube_url: normalizeUrl(body.youtube_url as string, 'https://youtube.com/@'),
    linkedin_url: body.linkedin_url ? String(body.linkedin_url).trim() : null,
    website: body.website ? String(body.website).trim() : null,
    logo_url: body.logo_url ? String(body.logo_url).trim() : null,
    founded_year: body.founded_year ? Number(body.founded_year) : null,
    employee_count: body.employee_count ? Number(body.employee_count) : null,
    details: (body.details && typeof body.details === 'object') ? body.details : {},
    people,
    people_updated_at: people.length > 0 ? new Date().toISOString() : null,
    added_at: new Date().toISOString(),
  };

  const client = supabaseServer();
  const { error, data } = await client
    .from('tracked_brands')
    .upsert(row, { onConflict: 'handle', ignoreDuplicates: false })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, brand: data });
}

export async function POST(request: NextRequest) {
  return upsertBrand(request);
}

export async function PUT(request: NextRequest) {
  return upsertBrand(request);
}
