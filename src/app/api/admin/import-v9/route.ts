import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * One-shot import of the v9 celebrity + company bundles from the
 * shared Google Drive folder.
 *
 *   celebrities_v9.json — 5,006 celebs (3,006 with IG handles),
 *                         region + category + IG/TikTok/YouTube
 *                         handles + follower estimates + eyewear
 *                         affinity + Lenskart relevance tags.
 *   companies_v9.json   — 3,068 eyewear companies with handle,
 *                         followers, LinkedIn, hq_city, category,
 *                         price tier, product focus, key people…
 *
 * Both upsert (idempotent): safe to re-run after the bundle is
 * refreshed. The endpoint is paginated (?offset=N&limit=N) so we can
 * respect Vercel's 800s timeout when the dataset grows.
 *
 * Auth: ?key=<CRON_SECRET>
 *
 *   GET /api/admin/import-v9?key=xxx&kind=celebrities&limit=500
 *   GET /api/admin/import-v9?key=xxx&kind=companies&limit=500
 */

export const maxDuration = 800;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

interface CelebrityV9 {
  id: number;
  uuid: string;
  name: string;
  aliases?: string[];
  region?: string | null;
  country?: string | null;
  category?: string | null;
  instagram_handle?: string | null;
  instagram_url?: string | null;
  instagram_followers_estimate?: number | null;
  twitter_handle?: string | null;
  youtube_handle?: string | null;
  tiktok_handle?: string | null;
  gender?: string | null;
  eyewear_affinity?: string | null;
  known_eyewear_brands?: string[];
  glasses_notes?: string | null;
  lenskart_relevance?: string | null;
  source?: string | null;
}

interface CompanyV9 {
  id: number;
  uuid: string;
  handle: string;
  name: string;
  aliases?: string[];
  country?: string | null;
  iso_alpha2?: string | null;
  region?: string | null;
  hq_city?: string | null;
  category?: string | null;
  subcategory?: string | null;
  business_type?: string | null;
  business_model?: string | null;
  distribution_channel?: string | null;
  price_tier?: string | null;
  product_focus?: string | null;
  founded_year?: number | null;
  parent_company?: string | null;
  ownership_type?: string | null;
  is_public?: boolean;
  stock_ticker?: string | null;
  flags?: Record<string, boolean>;
  financials_unverified?: Record<string, unknown>;
  digital?: {
    website?: string | null;
    domain?: string | null;
    instagram_handle?: string | null;
    instagram_followers?: number | null;
    instagram_verified?: boolean;
    linkedin_url?: string | null;
    facebook_url?: string | null;
    twitter_handle?: string | null;
    youtube_url?: string | null;
    tiktok_handle?: string | null;
  };
  key_people?: Array<{ name: string; title?: string; linkedin_url?: string }>;
  description?: string | null;
  tags?: string[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (key !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const kind = request.nextUrl.searchParams.get('kind');
  const limit = Math.min(2000, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '500')));
  const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get('offset') || '0'));

  if (kind !== 'celebrities' && kind !== 'companies') {
    return NextResponse.json({ error: 'kind must be celebrities or companies' }, { status: 400 });
  }

  // Load the bundle from disk. For prod builds Vercel inlines it.
  const filename = kind === 'celebrities' ? 'celebrities_v9.json' : 'companies_v9.json';
  const filePath = path.join(process.cwd(), 'src', 'data', filename);
  let fileJson: { celebrities?: CelebrityV9[]; companies?: CompanyV9[]; metadata?: Record<string, unknown> };
  try {
    fileJson = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch (err) {
    return NextResponse.json({
      error: `Failed to read ${filename}: ${err instanceof Error ? err.message : 'unknown'}`,
    }, { status: 500 });
  }

  const startedAt = Date.now();
  const client = supabaseServer();

  if (kind === 'celebrities') {
    const items = (fileJson.celebrities || []).slice(offset, offset + limit);
    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        kind,
        offset,
        limit,
        processed: 0,
        total: fileJson.celebrities?.length || 0,
        nextOffset: null,
        durationMs: Date.now() - startedAt,
      });
    }

    const rows = items.map(c => ({
      uuid: c.uuid,
      slug: slugify(c.name),
      name: c.name,
      aliases: c.aliases || [],
      region: c.region,
      country: c.country,
      category: c.category,
      gender: c.gender,
      instagram_handle: c.instagram_handle,
      instagram_url: c.instagram_url,
      instagram_followers: c.instagram_followers_estimate || null,
      twitter_handle: c.twitter_handle,
      youtube_handle: c.youtube_handle,
      tiktok_handle: c.tiktok_handle,
      eyewear_affinity: c.eyewear_affinity,
      known_eyewear_brands: c.known_eyewear_brands || [],
      glasses_notes: c.glasses_notes,
      lenskart_relevance: c.lenskart_relevance,
      source: c.source || 'v9_bundle',
    }));

    let upsert = await client.from('celebrities').upsert(rows, {
      onConflict: 'uuid',
      ignoreDuplicates: false,
    });
    if (upsert.error && /relation .* does not exist/i.test(upsert.error.message)) {
      return NextResponse.json({
        error: upsert.error.message,
        hint: 'Create the celebrities table first — run the SQL in /src/data/v9_schema.sql in your Supabase SQL editor, then retry.',
      }, { status: 500 });
    }
    if (upsert.error && /column|schema cache/i.test(upsert.error.message)) {
      // Schema is missing new columns. Fall back to a minimal payload
      // that every plausible celebrities table has.
      const minimal = rows.map(r => ({
        uuid: r.uuid,
        slug: r.slug,
        name: r.name,
        category: r.category,
        country: r.country,
        instagram_handle: r.instagram_handle,
      }));
      upsert = await client.from('celebrities').upsert(minimal, {
        onConflict: 'uuid',
        ignoreDuplicates: false,
      });
    }
    if (upsert.error) {
      return NextResponse.json({ error: upsert.error.message }, { status: 500 });
    }

    const totalSource = fileJson.celebrities?.length || 0;
    return NextResponse.json({
      success: true,
      kind,
      offset,
      limit,
      processed: rows.length,
      total: totalSource,
      nextOffset: offset + rows.length < totalSource ? offset + rows.length : null,
      durationMs: Date.now() - startedAt,
    });
  }

  // kind === 'companies'
  const items = (fileJson.companies || []).slice(offset, offset + limit);
  if (items.length === 0) {
    return NextResponse.json({
      success: true,
      kind,
      offset,
      limit,
      processed: 0,
      total: fileJson.companies?.length || 0,
      nextOffset: null,
      durationMs: Date.now() - startedAt,
    });
  }

  // Conservative payload: only columns guaranteed to exist on the
  // existing tracked_brands table. Everything else lives in data jsonb
  // so we don't need a schema migration to ship the import.
  const brandRows = items.map(c => {
    const d = c.digital || {};
    const handle = (d.instagram_handle || c.handle || slugify(c.name)).toLowerCase();
    return {
      handle,
      name: c.name,
      website: d.website || null,
      region: c.region || null,
      country: c.country || null,
      category: c.category || null,
      description: c.description || null,
      followers_count: d.instagram_followers ?? null,
      tier: pickTierForBrand(c),
      active: true,
      data: {
        v9: {
          uuid: c.uuid,
          aliases: c.aliases || [],
          iso_alpha2: c.iso_alpha2,
          hq_city: c.hq_city,
          subcategory: c.subcategory,
          business_type: c.business_type,
          business_model: c.business_model,
          distribution_channel: c.distribution_channel,
          price_tier: c.price_tier,
          product_focus: c.product_focus,
          founded_year: c.founded_year,
          parent_company: c.parent_company,
          ownership_type: c.ownership_type,
          is_public: !!c.is_public,
          stock_ticker: c.stock_ticker,
          flags: c.flags || {},
          tags: c.tags || [],
          key_people: c.key_people || [],
          linkedin_url: d.linkedin_url,
          youtube_url: d.youtube_url,
          tiktok_handle: d.tiktok_handle,
          twitter_handle: d.twitter_handle,
          instagram_verified: d.instagram_verified,
        },
      },
    };
  });

  // Try full upsert, fall back gracefully if the schema rejects (e.g.
  // missing `data` column or `tier` constraint). In that case strip
  // everything except (handle, name) so at minimum handles land in DB
  // for the cron to pick up.
  let upsertResult = await client.from('tracked_brands').upsert(brandRows, {
    onConflict: 'handle',
    ignoreDuplicates: false,
  });
  if (upsertResult.error && /column|does not exist|schema cache/i.test(upsertResult.error.message)) {
    const minimal = brandRows.map(r => ({
      handle: r.handle,
      name: r.name,
      category: r.category,
      region: r.region,
      followers_count: r.followers_count,
      active: true,
    }));
    upsertResult = await client.from('tracked_brands').upsert(minimal, {
      onConflict: 'handle',
      ignoreDuplicates: false,
    });
  }
  if (upsertResult.error) {
    return NextResponse.json({ error: upsertResult.error.message }, { status: 500 });
  }

  const totalSource = fileJson.companies?.length || 0;
  return NextResponse.json({
    success: true,
    kind,
    offset,
    limit,
    processed: brandRows.length,
    total: totalSource,
    nextOffset: offset + brandRows.length < totalSource ? offset + brandRows.length : null,
    durationMs: Date.now() - startedAt,
  });
}

/**
 * Bucket a brand into fast / mid / full tier for the cron. Top ~40
 * brands by follower count get 'fast'; the rest of the >=100k-follower
 * brands go to 'mid'; everything else is 'full' (once a day).
 * Luxury + D2C always land at least at mid so they don't get starved.
 */
function pickTierForBrand(c: CompanyV9): 'fast' | 'mid' | 'full' {
  const followers = c.digital?.instagram_followers || 0;
  const cat = (c.category || '').toLowerCase();
  const tags = (c.tags || []).join(' ').toLowerCase();
  const isPriority =
    followers >= 5_000_000 ||
    c.flags?.is_luxury ||
    cat.includes('luxury') ||
    tags.includes('luxury');
  if (isPriority) return 'fast';
  if (followers >= 100_000 || cat.includes('d2c') || c.flags?.is_d2c) return 'mid';
  return 'full';
}
