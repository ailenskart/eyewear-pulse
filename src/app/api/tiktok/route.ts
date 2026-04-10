import { NextRequest, NextResponse } from 'next/server';
import { runActor, isApifyConfigured, DEFAULT_ACTORS } from '@/lib/apify';

/**
 * TikTok — trending ads + hashtags.
 *
 * Primary path: Apify's clockworks/free-tiktok-scraper when
 * APIFY_TOKEN is set. Returns real TikTok posts reliably, bypassing
 * any rate limiting we'd hit with direct scraping.
 *
 * Fallback: direct scraping of TikTok Creative Center's unofficial
 * creative_radar_api endpoints (no auth, but rate-limited).
 *
 * Usage:
 *   GET /api/tiktok?mode=ads&region=US&period=7
 *   GET /api/tiktok?mode=hashtags&region=US
 *   GET /api/tiktok?mode=search&q=eyewear         (Apify only)
 */

export const maxDuration = 60;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en',
  'Origin': 'https://ads.tiktok.com',
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('mode') || 'ads';
  const region = searchParams.get('region') || 'US';
  const period = searchParams.get('period') || '7';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const q = (searchParams.get('q') || '').trim();

  // ── Apify search mode (keyword search) ──
  if (mode === 'search' && q) {
    if (!isApifyConfigured()) {
      return NextResponse.json({ ads: [], error: 'Search mode requires APIFY_TOKEN.' }, { status: 400 });
    }
    const input = {
      searchQueries: [q],
      resultsPerPage: limit,
      proxyCountryCode: region,
    };
    const result = await runActor(DEFAULT_ACTORS.tiktok, input, { timeout: 55, maxItems: limit });
    if (!result.ok) return NextResponse.json({ ads: [], error: result.error }, { status: 502 });
    return NextResponse.json({
      mode,
      region,
      q,
      total: result.items.length,
      ads: result.items.map((p: Record<string, unknown>) => {
        const video = p.videoMeta as Record<string, unknown> | undefined;
        const author = p.authorMeta as Record<string, unknown> | undefined;
        return {
          id: p.id as string,
          brand: (author?.name as string) || (author?.nickName as string) || '—',
          caption: (p.text as string) || '',
          cover: (video?.coverUrl as string) || (p.videoUrl as string) || '',
          videoUrl: (p.videoUrl as string) || (video?.downloadAddr as string),
          duration: video?.duration as number | undefined,
          likes: (p.diggCount as number) || 0,
          views: (p.playCount as number) || 0,
          comments: (p.commentCount as number) || 0,
          shares: (p.shareCount as number) || 0,
          sourceUrl: p.webVideoUrl as string,
        };
      }),
      source: 'apify',
    });
  }

  // ── Direct scraping: Creative Center top_ads + hashtag/list ──
  try {
    if (mode === 'ads') {
      const url = new URL('https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list');
      url.searchParams.set('period', period);
      url.searchParams.set('page', '1');
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('order_by', 'for_you');
      url.searchParams.set('country_code', region);

      const res = await fetch(url.toString(), { headers: HEADERS });
      if (!res.ok) {
        return NextResponse.json({
          ads: [],
          error: `TikTok Creative Center returned ${res.status}`,
          hint: 'Set APIFY_TOKEN to use the reliable Apify TikTok scraper instead.',
        }, { status: 502 });
      }
      const data = await res.json();
      const materials = data?.data?.materials || [];
      return NextResponse.json({
        mode, region, period: `${period}d`, total: materials.length,
        source: 'creative-center',
        ads: materials.map((m: Record<string, unknown>) => {
          const videoInfo = m.video_info as Record<string, unknown> | undefined;
          return {
            id: m.id,
            brand: (m.brand_name as string) || (m.brand as string) || '—',
            caption: (m.ad_title as string) || (m.title as string) || '',
            cover: (videoInfo?.cover as string) || (m.cover as string) || '',
            videoUrl: videoInfo?.video_url as string | undefined,
            duration: videoInfo?.duration as number | undefined,
            likes: m.like as number | undefined,
            views: m.ad_view as number | undefined,
            ctr: m.ctr as number | undefined,
            objective: m.objective as string | undefined,
            country: (m.country_code as string) || region,
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
      if (!res.ok) return NextResponse.json({ hashtags: [], error: `TikTok returned ${res.status}` }, { status: 502 });
      const data = await res.json();
      const list = data?.data?.list || [];
      return NextResponse.json({
        mode, region, period: `${period}d`, total: list.length,
        source: 'creative-center',
        hashtags: list.map((h: Record<string, unknown>) => ({
          name: h.hashtag_name as string | undefined,
          views: h.publish_cnt as number | undefined,
          rank: h.rank as number | undefined,
          rankDiff: h.rank_diff as number | undefined,
        })),
      });
    }

    return NextResponse.json({ error: 'Invalid mode. Use ads, hashtags, or search (Apify-only).' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'TikTok fetch failed',
    }, { status: 500 });
  }
}
