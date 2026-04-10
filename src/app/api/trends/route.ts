import { NextRequest, NextResponse } from 'next/server';

/**
 * Google Trends — unofficial public endpoints.
 *
 * Google Trends exposes JSON endpoints that are used by the
 * public-facing website itself. They're rate-limited per IP
 * and prefix responses with `)]}',` junk that needs stripping,
 * but they work without auth.
 *
 * Flow: hit the "explore" endpoint to get request tokens, then
 * hit the "multiline" / "relatedsearches" endpoints with those
 * tokens to pull actual data.
 *
 * Usage:
 *   GET /api/trends?q=sunglasses&geo=IN&timeframe=today 3-m
 *   GET /api/trends?q=ray-ban,oakley,lenskart&geo=US (comparison)
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Google prefixes responses with `)]}',\n` — strip it before JSON.parse
const stripJunk = (txt: string) => txt.replace(/^\)\]\}',?\n?/, '');

interface ExploreToken {
  id: string;
  token: string;
  request: unknown;
}

async function explore(terms: string[], geo: string, timeframe: string): Promise<ExploreToken[] | null> {
  const keywords = terms.map(t => ({ keyword: t, geo, time: timeframe }));
  const req = {
    comparisonItem: keywords,
    category: 0,
    property: '',
  };
  const url = new URL('https://trends.google.com/trends/api/explore');
  url.searchParams.set('hl', 'en-US');
  url.searchParams.set('tz', '-330'); // IST
  url.searchParams.set('req', JSON.stringify(req));

  try {
    const res = await fetch(url.toString(), { headers: HEADERS });
    if (!res.ok) return null;
    const txt = await res.text();
    const data = JSON.parse(stripJunk(txt));
    return data.widgets || null;
  } catch {
    return null;
  }
}

async function fetchWidget(widget: ExploreToken, endpoint: string): Promise<unknown> {
  const url = new URL(`https://trends.google.com/trends/api/widgetdata/${endpoint}`);
  url.searchParams.set('hl', 'en-US');
  url.searchParams.set('tz', '-330');
  url.searchParams.set('req', JSON.stringify(widget.request));
  url.searchParams.set('token', widget.token);
  try {
    const res = await fetch(url.toString(), { headers: HEADERS });
    if (!res.ok) return null;
    const txt = await res.text();
    return JSON.parse(stripJunk(txt));
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q') || 'sunglasses';
  const geo = searchParams.get('geo') || '';
  const timeframe = searchParams.get('timeframe') || 'today 3-m';

  const terms = q.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5);
  if (terms.length === 0) {
    return NextResponse.json({ error: 'q param required' }, { status: 400 });
  }

  try {
    const widgets = await explore(terms, geo, timeframe);
    if (!widgets) {
      return NextResponse.json({
        error: 'Google Trends rejected the request (rate limit or geo block)',
        hint: 'Try again in a minute or change the geo parameter.',
      }, { status: 502 });
    }

    // Pull the three interesting widgets: interest over time,
    // related queries, and related topics.
    const timelineWidget = widgets.find((w: ExploreToken & { id: string }) => w.id === 'TIMESERIES');
    const relatedQueriesWidget = widgets.find((w: ExploreToken & { id: string }) => w.id.startsWith('RELATED_QUERIES'));
    const relatedTopicsWidget = widgets.find((w: ExploreToken & { id: string }) => w.id.startsWith('RELATED_TOPICS'));

    const [timeline, relatedQueries, relatedTopics] = await Promise.all([
      timelineWidget ? fetchWidget(timelineWidget, 'multiline') : null,
      relatedQueriesWidget ? fetchWidget(relatedQueriesWidget, 'relatedsearches') : null,
      relatedTopicsWidget ? fetchWidget(relatedTopicsWidget, 'relatedsearches') : null,
    ]);

    return NextResponse.json({
      terms,
      geo: geo || 'Worldwide',
      timeframe,
      timeline,
      relatedQueries,
      relatedTopics,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Trends fetch failed',
    }, { status: 500 });
  }
}
