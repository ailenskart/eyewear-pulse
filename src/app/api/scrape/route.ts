import { NextRequest, NextResponse } from 'next/server';
import { BRANDS } from '@/lib/brands';
import { scrapeProfile, generateFallbackData } from '@/lib/scraper';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const handle = searchParams.get('handle');

  if (!handle) {
    return NextResponse.json({ error: 'Handle parameter required' }, { status: 400 });
  }

  const brand = BRANDS.find(b => b.handle === handle);

  // Try live scraping first
  const scraped = await scrapeProfile(handle);

  if (scraped) {
    return NextResponse.json({
      ...scraped,
      brand: brand || null,
    });
  }

  // Fallback to generated data
  const fallback = generateFallbackData(handle, {
    name: brand?.name || handle,
    category: brand?.category || 'D2C',
    followerEstimate: brand?.followerEstimate || 10000,
  });

  return NextResponse.json({
    ...fallback,
    brand: brand || null,
  });
}
