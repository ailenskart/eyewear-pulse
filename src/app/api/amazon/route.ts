import { NextRequest, NextResponse } from 'next/server';
import { runActor, isApifyConfigured, apifySetupInstructions, DEFAULT_ACTORS } from '@/lib/apify';

/**
 * Amazon product search via Apify.
 *
 * Uses junglee/Amazon-crawler by default (overridable via
 * APIFY_AMAZON_ACTOR env var). Returns product cards with prices,
 * star ratings, review counts, sponsored flag, and ASINs.
 *
 *   GET /api/amazon?q=sunglasses&country=com&limit=30
 *   Country codes: com (US) | in | co.uk | ca | com.au | de | fr
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get('q') || '').trim();
  const country = searchParams.get('country') || 'com';
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

  if (!q) return NextResponse.json({ error: 'q param required' }, { status: 400 });

  if (!isApifyConfigured()) {
    return NextResponse.json({
      products: [],
      needsSetup: true,
      setupInstructions: apifySetupInstructions(),
    });
  }

  const input = {
    categoryOrProductUrls: [
      { url: `https://www.amazon.${country}/s?k=${encodeURIComponent(q)}` },
    ],
    maxItemsPerStartUrl: limit,
    proxyCountry: country === 'in' ? 'IN' : country === 'co.uk' ? 'GB' : 'US',
    scrapeProductDetails: false,
    scrapeSellers: false,
  };

  const result = await runActor(DEFAULT_ACTORS.amazon, input, { timeout: 55, maxItems: limit });
  if (!result.ok) {
    return NextResponse.json({ products: [], error: result.error, actor: result.actor }, { status: 502 });
  }

  const products = result.items.map((p: Record<string, unknown>) => {
    const price = p.price as Record<string, unknown> | string | undefined;
    return {
      asin: p.asin as string | undefined,
      title: (p.title as string) || (p.name as string),
      url: (p.url as string) || (p.productUrl as string) || (p.asin ? `https://www.amazon.${country}/dp/${p.asin}` : ''),
      image: (p.thumbnailImage as string) || (p.image as string) || (p.imageUrl as string),
      price: typeof price === 'object' && price !== null ? (price.value as number) || (price.current as number) : price,
      currency: typeof price === 'object' && price !== null ? (price.currency as string) : (p.currency as string),
      rating: (p.stars as number) || (p.rating as number),
      reviews: (p.reviewsCount as number) || (p.reviews as number),
      prime: p.prime as boolean | undefined,
      sponsored: p.sponsored as boolean | undefined,
      brand: p.brand as string | undefined,
    };
  });

  return NextResponse.json({
    q,
    country,
    total: products.length,
    products,
    source: 'apify',
    actor: result.actor,
  });
}
