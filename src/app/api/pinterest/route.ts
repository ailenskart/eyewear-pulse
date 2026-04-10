import { NextRequest, NextResponse } from 'next/server';

/**
 * Pinterest Trends — visual trends intelligence.
 *
 * Pinterest Trends has a public JSON endpoint that their own
 * trends.pinterest.com frontend uses. No auth required for
 * basic queries.
 *
 * Usage:
 *   GET /api/pinterest?q=eyewear&region=US
 *   GET /api/pinterest?q=sunglasses&timeframe=MONTH
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://trends.pinterest.com/',
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get('q') || 'eyewear').trim();
  const region = searchParams.get('region') || 'US'; // US | GB | DE | FR | JP | AU | CA | MX | BR | IN
  const timeframe = searchParams.get('timeframe') || 'MONTH'; // WEEK | MONTH | YEAR

  try {
    // Pinterest Trends internal API — terms autocomplete + details
    const url = `https://trends.pinterest.com/api/v1/top/keywords/?type=yearly&region=${region}&normalize_against_group=false`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      return NextResponse.json({
        error: `Pinterest returned ${res.status}`,
        hint: 'Pinterest Trends may have changed their internal shape or blocked the request.',
      }, { status: 502 });
    }
    const data = await res.json();

    // Search the top list for matches to the query
    const all = data?.keywords || data?.data || [];
    const filtered = Array.isArray(all)
      ? all.filter((k: { keyword?: string; display_name?: string }) =>
          (k.keyword || k.display_name || '').toLowerCase().includes(q.toLowerCase())
        )
      : [];

    return NextResponse.json({
      q,
      region,
      timeframe,
      total: filtered.length,
      trending: filtered.slice(0, 30).map((k: Record<string, unknown>) => ({
        keyword: (k.keyword as string) || (k.display_name as string) || '',
        rank: k.rank as number | undefined,
        weeklyChange: k.pct_change_prev_7d as number | undefined,
        monthlyChange: k.pct_change_prev_30d as number | undefined,
        searchVolume: k.weekly_searches as number | undefined,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Pinterest fetch failed',
    }, { status: 500 });
  }
}
