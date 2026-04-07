import { NextRequest, NextResponse } from 'next/server';
import { BRANDS } from '@/lib/brands';
import { scrapeProfile, generateFallbackData } from '@/lib/scraper';
import { scrapeUserMeta } from '@/lib/instatouch-scraper';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const handle = searchParams.get('handle');

  if (!handle) {
    return NextResponse.json({ error: 'Handle parameter required' }, { status: 400 });
  }

  const brand = BRANDS.find(b => b.handle === handle);

  // Try instatouch first (more reliable)
  const instaMeta = await scrapeUserMeta(handle);
  if (instaMeta) {
    return NextResponse.json({
      handle: instaMeta.handle,
      profilePic: instaMeta.profilePicUrl,
      bio: instaMeta.biography,
      followers: instaMeta.followers,
      following: instaMeta.following,
      posts: instaMeta.posts,
      isVerified: instaMeta.isVerified,
      isBusinessAccount: instaMeta.isBusinessAccount,
      scrapedAt: new Date().toISOString(),
      isLive: true,
      source: 'instatouch',
      brand: brand || null,
    });
  }

  // Fallback: try cheerio-based scraper
  const scraped = await scrapeProfile(handle);
  if (scraped) {
    return NextResponse.json({
      ...scraped,
      source: 'cheerio',
      brand: brand || null,
    });
  }

  // Final fallback: generated data
  const fallback = generateFallbackData(handle, {
    name: brand?.name || handle,
    category: brand?.category || 'D2C',
    followerEstimate: brand?.followerEstimate || 10000,
  });

  return NextResponse.json({
    ...fallback,
    source: 'fallback',
    brand: brand || null,
  });
}
