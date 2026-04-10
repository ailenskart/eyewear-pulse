import { NextRequest, NextResponse } from 'next/server';

/**
 * TikTok Creative Center — trending ads + hashtags.
 *
 * TikTok runs a public "Creative Center" at
 * ads.tiktok.com/business/creativecenter/ that exposes trending
 * ads, hashtags, songs, and creators. Their backend is a JSON
 * API at /business-api/v2/pacific/ with an undocumented but
 * functional anonymous-access mode.
 *
 * These endpoints return real production data without auth — no
 * API key needed. They occasionally rate-limit, so we add a
 * friendly User-Agent and handle errors gracefully.
 *
 * Usage:
 *   GET /api/tiktok?mode=ads&region=IN&period=7
 *   GET /api/tiktok?mode=hashtags&period=30
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en',
  'Origin': 'https://ads.tiktok.com',
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('mode') || 'ads'; // ads | hashtags | songs
  const region = searchParams.get('region') || 'IN';
  const period = searchParams.get('period') || '7'; // 7 | 30 | 120 days
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const industry = searchParams.get('industry') || ''; // optional industry filter

  try {
    if (mode === 'ads') {
      // Top ads endpoint
      const url = new URL('https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list');
      url.searchParams.set('period', period);
      url.searchParams.set('page', '1');
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('order_by', 'for_you');
      url.searchParams.set('country_code', region);
      if (industry) url.searchParams.set('industry_id', industry);

      const res = await fetch(url.toString(), { headers: HEADERS });
      if (!res.ok) {
        return NextResponse.json({
          ads: [],
          error: `TikTok returned ${res.status}`,
          hint: 'TikTok occasionally rate-limits unauthenticated requests. Try again in a minute.',
        }, { status: 502 });
      }
      const data = await res.json();
      const materials = data?.data?.materials || [];
      return NextResponse.json({
        mode,
        region,
        period: `${period}d`,
        total: materials.length,
        ads: materials.map((m: Record<string, unknown>) => {
          const brand = m.brand_name || m.brand || '';
          const videoInfo = m.video_info as Record<string, unknown> | undefined;
          return {
            id: m.id,
            brand: brand || '—',
            caption: (m.ad_title as string) || (m.title as string) || '',
            cover: videoInfo?.cover as string | undefined || (m.cover as string) || '',
            videoUrl: videoInfo?.video_url as string | undefined,
            duration: videoInfo?.duration as number | undefined,
            likes: m.like as number | undefined,
            views: m.ad_view as number | undefined,
            ctr: m.ctr as number | undefined,
            objective: m.objective as string | undefined,
            industry: m.industry_key as string | undefined,
            country: m.country_code as string | undefined || region,
            sourceUrl: `https://ads.tiktok.com/business/creativecenter/ads/detail/${m.id}/pc/en`,
          };
        }),
      });
    }

    if (mode === 'hashtags') {
      const url = new URL('https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list');
      url.searchParams.set('period', period);
      url.searchParams.set('page', '1');
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('country_code', region);
      url.searchParams.set('sort_by', 'popular');

      const res = await fetch(url.toString(), { headers: HEADERS });
      if (!res.ok) {
        return NextResponse.json({ hashtags: [], error: `TikTok returned ${res.status}` }, { status: 502 });
      }
      const data = await res.json();
      const list = data?.data?.list || [];
      return NextResponse.json({
        mode,
        region,
        period: `${period}d`,
        total: list.length,
        hashtags: list.map((h: Record<string, unknown>) => ({
          name: h.hashtag_name as string | undefined,
          views: h.publish_cnt as number | undefined,
          rank: h.rank as number | undefined,
          rankDiff: h.rank_diff as number | undefined,
          isPromoted: h.is_promoted as boolean | undefined,
        })),
      });
    }

    return NextResponse.json({ error: 'Invalid mode. Use ads or hashtags' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'TikTok fetch failed',
      hint: 'TikTok may have changed their internal API shape.',
    }, { status: 500 });
  }
}
