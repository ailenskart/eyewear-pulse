import { NextRequest, NextResponse } from 'next/server';

/**
 * Meta Ad Library — Spyder equivalent.
 *
 * Queries Meta's official Graph API `ads_archive` endpoint:
 *   https://developers.facebook.com/docs/marketing-api/reference/archived-ad
 *
 * Requires META_AD_LIBRARY_TOKEN env var (get one at
 * developers.facebook.com → create app → Marketing API → generate
 * access token with ads_read permission). This is free.
 *
 * Without the token, returns a friendly setup response so the UI
 * can render a "connect your Meta account" panel.
 */

const META_TOKEN = process.env.META_AD_LIBRARY_TOKEN || '';

interface MetaAd {
  id: string;
  page_name?: string;
  page_id?: string;
  ad_creative_body?: string;
  ad_creative_link_caption?: string;
  ad_creative_link_description?: string;
  ad_creative_link_title?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  currency?: string;
  impressions?: { lower_bound: string; upper_bound: string };
  spend?: { lower_bound: string; upper_bound: string };
  publisher_platforms?: string[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get('q') || '';
  const country = searchParams.get('country') || 'ALL'; // default global
  const limit = parseInt(searchParams.get('limit') || '40');

  if (!META_TOKEN) {
    return NextResponse.json({
      ads: [],
      needsSetup: true,
      setupInstructions: {
        title: 'Connect Meta Ad Library',
        steps: [
          'Go to developers.facebook.com → create a Meta App (Business type)',
          'Add the Marketing API product',
          'In Tools → Graph API Explorer, generate a long-lived access token with `ads_read` permission',
          'Add it to your Vercel env vars as META_AD_LIBRARY_TOKEN',
          'Redeploy — eyewear competitor ads will appear here automatically',
        ],
      },
    });
  }

  if (!search.trim()) {
    return NextResponse.json({ ads: [], error: 'Search term required' }, { status: 400 });
  }

  const fields = [
    'id',
    'page_name',
    'page_id',
    'ad_creative_bodies',
    'ad_creative_link_captions',
    'ad_creative_link_descriptions',
    'ad_creative_link_titles',
    'ad_delivery_start_time',
    'ad_delivery_stop_time',
    'ad_snapshot_url',
    'currency',
    'impressions',
    'spend',
    'publisher_platforms',
  ].join(',');

  const url = new URL('https://graph.facebook.com/v19.0/ads_archive');
  url.searchParams.set('search_terms', search);
  // Meta accepts "ALL" for worldwide, or a JSON array of ISO country codes
  if (country === 'ALL') {
    url.searchParams.set('ad_reached_countries', '["ALL"]');
  } else {
    url.searchParams.set('ad_reached_countries', `["${country}"]`);
  }
  url.searchParams.set('ad_active_status', 'ALL');
  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', String(Math.min(limit, 100)));
  url.searchParams.set('access_token', META_TOKEN);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.error) {
      return NextResponse.json({
        ads: [],
        error: data.error.message,
        code: data.error.code,
      }, { status: 502 });
    }

    const ads: MetaAd[] = (data.data || []).map((a: Record<string, unknown>) => ({
      id: String(a.id),
      page_name: a.page_name as string | undefined,
      page_id: a.page_id as string | undefined,
      ad_creative_body: Array.isArray(a.ad_creative_bodies) ? a.ad_creative_bodies[0] : undefined,
      ad_creative_link_caption: Array.isArray(a.ad_creative_link_captions) ? a.ad_creative_link_captions[0] : undefined,
      ad_creative_link_description: Array.isArray(a.ad_creative_link_descriptions) ? a.ad_creative_link_descriptions[0] : undefined,
      ad_creative_link_title: Array.isArray(a.ad_creative_link_titles) ? a.ad_creative_link_titles[0] : undefined,
      ad_delivery_start_time: a.ad_delivery_start_time as string | undefined,
      ad_delivery_stop_time: a.ad_delivery_stop_time as string | undefined,
      ad_snapshot_url: a.ad_snapshot_url as string | undefined,
      currency: a.currency as string | undefined,
      impressions: a.impressions as { lower_bound: string; upper_bound: string } | undefined,
      spend: a.spend as { lower_bound: string; upper_bound: string } | undefined,
      publisher_platforms: a.publisher_platforms as string[] | undefined,
    }));

    return NextResponse.json({
      ads,
      total: ads.length,
      paging: data.paging,
      search,
      country,
    });
  } catch (err) {
    return NextResponse.json({
      ads: [],
      error: err instanceof Error ? err.message : 'Meta API fetch failed',
    }, { status: 500 });
  }
}
