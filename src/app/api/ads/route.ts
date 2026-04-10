import { NextRequest, NextResponse } from 'next/server';
import { runActor, isApifyConfigured, apifySetupInstructions, DEFAULT_ACTORS } from '@/lib/apify';

/**
 * Meta Ad Library — competitor paid ads.
 *
 * Primary path: Apify's facebook-ads-library-scraper actor. Works
 * without a Meta Graph API token (scrapes the public Ad Library UI).
 * Costs ~$0.50 per 1000 ads, pay-per-use.
 *
 * Fallback: Meta Graph API v19 ads_archive endpoint if
 * META_AD_LIBRARY_TOKEN is set — free but requires a Meta app.
 *
 * Usage:
 *   GET /api/ads?q=Lenskart&country=IN&limit=40
 */

export const maxDuration = 60;

const META_TOKEN = process.env.META_AD_LIBRARY_TOKEN || '';

interface UnifiedAd {
  id: string;
  page_name?: string;
  page_id?: string;
  ad_creative_body?: string;
  ad_creative_link_title?: string;
  ad_creative_link_description?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  image_url?: string;
  currency?: string;
  impressions?: { lower_bound: string; upper_bound: string };
  spend?: { lower_bound: string; upper_bound: string };
  publisher_platforms?: string[];
}

async function viaApify(query: string, country: string, limit: number) {
  const input = {
    urls: [{
      url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country === 'ALL' ? 'ALL' : country}&q=${encodeURIComponent(query)}&search_type=keyword_unordered&media_type=all`,
    }],
    count: Math.min(limit, 100),
    'scrapePageAds.activeStatus': 'all',
  };
  const result = await runActor(DEFAULT_ACTORS.metaAds, input, { timeout: 55, maxItems: limit });
  if (!result.ok) return result;

  // Normalize Apify output to our unified shape. Actors return varying
  // schemas — we pick the common fields.
  const ads: UnifiedAd[] = result.items.map((raw: Record<string, unknown>) => {
    const snapshot = raw.snapshot as Record<string, unknown> | undefined;
    const bodies = snapshot?.body as { text?: string } | string | undefined;
    const bodyText = typeof bodies === 'string' ? bodies : bodies?.text;
    const cards = snapshot?.cards as Array<Record<string, unknown>> | undefined;
    const firstCard = cards?.[0];
    const images = snapshot?.images as Array<{ original_image_url?: string }> | undefined;
    const videos = snapshot?.videos as Array<{ video_preview_image_url?: string }> | undefined;
    const imageUrl =
      (firstCard?.resized_image_url as string) ||
      (firstCard?.original_image_url as string) ||
      images?.[0]?.original_image_url ||
      videos?.[0]?.video_preview_image_url ||
      (raw.image_url as string);

    return {
      id: String(raw.ad_archive_id || raw.adArchiveId || raw.id || Math.random().toString(36)),
      page_name: (raw.page_name as string) || (raw.pageName as string) || (snapshot?.page_name as string),
      page_id: (raw.page_id as string) || (raw.pageId as string),
      ad_creative_body: bodyText,
      ad_creative_link_title: firstCard?.title as string | undefined,
      ad_creative_link_description: firstCard?.body as string | undefined,
      ad_delivery_start_time: (raw.start_date as string) || (raw.startDate as string) || (raw.startDateString as string),
      ad_delivery_stop_time: (raw.end_date as string) || (raw.endDate as string) || (raw.endDateString as string),
      ad_snapshot_url: (raw.url as string) || (raw.snapshot_url as string) || `https://www.facebook.com/ads/library/?id=${raw.ad_archive_id || raw.id}`,
      image_url: imageUrl,
      currency: raw.currency as string | undefined,
      impressions: raw.impressions as UnifiedAd['impressions'],
      spend: raw.spend as UnifiedAd['spend'],
      publisher_platforms: raw.publisher_platforms as string[] | undefined,
    };
  });

  return { ok: true as const, items: ads };
}

async function viaGraphAPI(query: string, country: string, limit: number) {
  const fields = [
    'id', 'page_name', 'page_id',
    'ad_creative_bodies', 'ad_creative_link_captions',
    'ad_creative_link_descriptions', 'ad_creative_link_titles',
    'ad_delivery_start_time', 'ad_delivery_stop_time',
    'ad_snapshot_url', 'currency', 'impressions', 'spend',
    'publisher_platforms',
  ].join(',');
  const url = new URL('https://graph.facebook.com/v19.0/ads_archive');
  url.searchParams.set('search_terms', query);
  if (country === 'ALL') {
    url.searchParams.set('ad_reached_countries', '["ALL"]');
  } else {
    url.searchParams.set('ad_reached_countries', `["${country}"]`);
  }
  url.searchParams.set('ad_active_status', 'ALL');
  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', String(Math.min(limit, 100)));
  url.searchParams.set('access_token', META_TOKEN);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) return { ok: false as const, error: data.error.message };

  const ads: UnifiedAd[] = (data.data || []).map((a: Record<string, unknown>) => ({
    id: String(a.id),
    page_name: a.page_name as string | undefined,
    page_id: a.page_id as string | undefined,
    ad_creative_body: Array.isArray(a.ad_creative_bodies) ? a.ad_creative_bodies[0] : undefined,
    ad_creative_link_title: Array.isArray(a.ad_creative_link_titles) ? a.ad_creative_link_titles[0] : undefined,
    ad_creative_link_description: Array.isArray(a.ad_creative_link_descriptions) ? a.ad_creative_link_descriptions[0] : undefined,
    ad_delivery_start_time: a.ad_delivery_start_time as string | undefined,
    ad_delivery_stop_time: a.ad_delivery_stop_time as string | undefined,
    ad_snapshot_url: a.ad_snapshot_url as string | undefined,
    currency: a.currency as string | undefined,
    impressions: a.impressions as UnifiedAd['impressions'],
    spend: a.spend as UnifiedAd['spend'],
    publisher_platforms: a.publisher_platforms as string[] | undefined,
  }));
  return { ok: true as const, items: ads };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get('q') || '';
  const country = searchParams.get('country') || 'ALL';
  const limit = parseInt(searchParams.get('limit') || '40');
  const forcedSource = searchParams.get('source'); // 'apify' | 'graph'

  if (!search.trim()) {
    return NextResponse.json({ ads: [], error: 'Search term required' }, { status: 400 });
  }

  // Neither configured — show setup screen
  if (!isApifyConfigured() && !META_TOKEN) {
    return NextResponse.json({
      ads: [],
      needsSetup: true,
      setupInstructions: {
        title: 'Connect Meta Ad Library (pick one)',
        apify: apifySetupInstructions(),
        graph: {
          title: 'OR use Meta Graph API (free but more setup)',
          steps: [
            'Go to developers.facebook.com → create Meta App',
            'Add Marketing API product',
            'Tools → Graph API Explorer → generate token with ads_read',
            'Add META_AD_LIBRARY_TOKEN to Vercel env vars',
          ],
        },
        recommendation: 'Apify is easier — one token covers 8+ intelligence sources. Graph API is free but setup is slow.',
      },
    });
  }

  try {
    let result;
    let source: string;

    if (forcedSource === 'graph' && META_TOKEN) {
      result = await viaGraphAPI(search, country, limit);
      source = 'graph';
    } else if (forcedSource === 'apify' || (!META_TOKEN && isApifyConfigured())) {
      result = await viaApify(search, country, limit);
      source = 'apify';
    } else if (META_TOKEN) {
      result = await viaGraphAPI(search, country, limit);
      source = 'graph';
    } else {
      result = await viaApify(search, country, limit);
      source = 'apify';
    }

    if (!result.ok) {
      return NextResponse.json({ ads: [], error: result.error, source }, { status: 502 });
    }

    return NextResponse.json({
      ads: result.items,
      total: result.items.length,
      search,
      country,
      source,
    });
  } catch (err) {
    return NextResponse.json({
      ads: [],
      error: err instanceof Error ? err.message : 'Ad library fetch failed',
    }, { status: 500 });
  }
}
