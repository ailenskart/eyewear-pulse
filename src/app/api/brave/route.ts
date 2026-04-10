import { NextRequest, NextResponse } from 'next/server';

/**
 * Brave Search API — independent web + news search.
 *
 * Brave's index is the best free alternative to Google Search
 * since Bing shut down its free tier. Their free plan is 2000
 * queries/month, 1 query/sec — plenty for an internal tool.
 *
 * Get a key at api.search.brave.com (free signup, no credit card
 * for the Data for Search "Free" plan). Set BRAVE_SEARCH_KEY in
 * env vars.
 *
 * Usage:
 *   GET /api/brave?q=lenskart+new+collection
 *   GET /api/brave?q=oakley+ads&mode=news
 *   GET /api/brave?q=eyewear+trends&country=IN&freshness=pw  (past week)
 */

const KEY = process.env.BRAVE_SEARCH_KEY || '';

function needsSetup() {
  return {
    results: [],
    needsSetup: true,
    setupInstructions: {
      title: 'Connect Brave Search API',
      steps: [
        'Go to api.search.brave.com → Sign in with Google/email',
        'Subscribe to the free "Data for Search — Free" plan (no credit card)',
        'Copy your API key from the dashboard',
        'Add it to Vercel env vars as BRAVE_SEARCH_KEY',
        'Redeploy — independent web + news search will be available',
        'Free tier: 2000 queries / month, 1 query / second',
      ],
    },
  };
}

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  thumbnail?: { src?: string };
  profile?: { name?: string; img?: string };
}

interface BraveNewsResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  page_age?: string;
  meta_url?: { hostname?: string };
  thumbnail?: { src?: string };
}

export async function GET(request: NextRequest) {
  if (!KEY) return NextResponse.json(needsSetup());

  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.trim() || '';
  const mode = searchParams.get('mode') || 'web'; // web | news
  const country = searchParams.get('country') || 'IN';
  const freshness = searchParams.get('freshness') || ''; // pd=past day, pw=past week, pm=past month, py=past year
  const count = Math.min(parseInt(searchParams.get('count') || '20'), 20);

  if (!q) return NextResponse.json({ error: 'q param required' }, { status: 400 });

  try {
    const endpoint = mode === 'news' ? 'news/search' : 'web/search';
    const url = new URL(`https://api.search.brave.com/res/v1/${endpoint}`);
    url.searchParams.set('q', q);
    url.searchParams.set('country', country);
    url.searchParams.set('count', String(count));
    if (freshness) url.searchParams.set('freshness', freshness);

    const res = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': KEY,
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return NextResponse.json({
        error: `Brave API returned ${res.status}`,
        detail: txt.substring(0, 300),
      }, { status: 502 });
    }

    const data = await res.json();

    if (mode === 'news') {
      const items: BraveNewsResult[] = data?.results || [];
      return NextResponse.json({
        q,
        mode,
        country,
        results: items.map(r => ({
          title: r.title,
          url: r.url,
          description: r.description,
          age: r.age || r.page_age,
          source: r.meta_url?.hostname,
          thumbnail: r.thumbnail?.src,
        })),
        total: items.length,
      });
    }

    const items: BraveWebResult[] = data?.web?.results || [];
    return NextResponse.json({
      q,
      mode,
      country,
      results: items.map(r => ({
        title: r.title,
        url: r.url,
        description: r.description,
        age: r.age,
        source: r.profile?.name || (r.url.match(/https?:\/\/([^/]+)/) || [])[1],
        thumbnail: r.thumbnail?.src || r.profile?.img,
      })),
      total: items.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Brave fetch failed' }, { status: 500 });
  }
}
