import { NextRequest, NextResponse } from 'next/server';

/**
 * Google Ads Transparency Center scraper.
 *
 * Google publishes every advertiser's ads at
 * adstransparency.google.com. The public site is a React SPA
 * so we can't just fetch the HTML — we need to hit the
 * underlying batchexecute RPC endpoint it uses internally.
 *
 * Endpoint: https://adstransparency.google.com/_/AdsTransparencyCenterUi/data/batchexecute
 *
 * The RPC is noisy (Google-style `)]}',\n` prefix, nested array
 * protobuf encoding) so we parse carefully and return a
 * sanitized shape.
 *
 * Usage:
 *   GET /api/google-ads?advertiser=Lenskart&region=IN
 *   GET /api/google-ads?advertiser=Ray-Ban&region=US
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://adstransparency.google.com',
  'Referer': 'https://adstransparency.google.com/',
  'X-Same-Domain': '1',
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
};

const stripJunk = (txt: string) => txt.replace(/^\)\]\}',?\n?/, '');

interface CleanAd {
  advertiserId?: string;
  advertiserName?: string;
  creativeId?: string;
  firstShown?: string;
  lastShown?: string;
  format?: string;
  regionsCount?: number;
  snapshotUrl?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const advertiser = (searchParams.get('advertiser') || '').trim();
  const region = (searchParams.get('region') || 'IN').toUpperCase();

  if (!advertiser) {
    return NextResponse.json({ error: 'advertiser param required' }, { status: 400 });
  }

  try {
    // Step 1: search for the advertiser to get its ID
    const searchRpc = {
      'f.req': JSON.stringify([[[
        'zjvVYf',
        JSON.stringify([null, advertiser, region, 20, null, null, null, null, null, null, null, 0]),
        null,
        'generic',
      ]]]),
    };
    const body = new URLSearchParams(searchRpc).toString();

    const searchRes = await fetch('https://adstransparency.google.com/_/AdsTransparencyCenterUi/data/batchexecute?rpcids=zjvVYf&f.sid=-1&bl=boq_ads-transparency-center-ui&hl=en&_reqid=1000&rt=c', {
      method: 'POST',
      headers: HEADERS,
      body,
    });

    if (!searchRes.ok) {
      return NextResponse.json({
        error: `Google Ads Transparency returned ${searchRes.status}`,
        hint: 'Google may have changed their internal API or rate-limited us.',
      }, { status: 502 });
    }

    const txt = await searchRes.text();
    const cleaned = stripJunk(txt);

    // The response is a multi-frame batchexecute: frames separated by length
    // prefixes. We try to parse out JSON arrays from the raw text since the
    // full format is complex.
    // Use [\s\S] instead of the /s flag for broader TS target compatibility.
    const jsonMatches = cleaned.match(/\[\[[\s\S]*?\]\]/g) || [];

    // Try each match — the actual ad data is nested inside
    const ads: CleanAd[] = [];
    let advertiserId = '';
    let advertiserName = '';

    for (const m of jsonMatches) {
      try {
        const parsed = JSON.parse(m);
        // Walk the structure looking for advertiser records
        const walk = (node: unknown) => {
          if (!node) return;
          if (Array.isArray(node)) {
            // Advertiser IDs tend to be 'AR01234567890123456789'
            for (const el of node) {
              if (typeof el === 'string' && /^AR\d{15,}$/.test(el) && !advertiserId) {
                advertiserId = el;
              }
              if (typeof el === 'string' && el.length > 2 && el.length < 120 && /eyewear|glass|sunglass|optic|lens|spec|frame|vision/i.test(el) && !advertiserName) {
                advertiserName = el;
              }
              walk(el);
            }
          }
        };
        walk(parsed);
      } catch { continue; }
    }

    if (!advertiserId) {
      return NextResponse.json({
        ads: [],
        advertiserSearched: advertiser,
        region,
        note: 'Could not resolve advertiser ID. Google Ads Transparency may have changed their internal RPC shape, or the advertiser doesn\'t run Google Ads in this region.',
        rawPreview: cleaned.substring(0, 500),
      });
    }

    return NextResponse.json({
      ads,
      advertiserId,
      advertiserName: advertiserName || advertiser,
      region,
      profileUrl: `https://adstransparency.google.com/advertiser/${advertiserId}?region=${region}`,
      note: 'Google Ads Transparency Center scraping requires deeper protobuf parsing for full ad creatives. For now we return the advertiser profile URL you can open directly.',
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Google Ads fetch failed',
    }, { status: 500 });
  }
}
