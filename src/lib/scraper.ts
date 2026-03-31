import * as cheerio from 'cheerio';

/**
 * Represents a scraped Instagram profile
 */
export interface ScrapedProfile {
  handle: string;
  profilePic: string | null;
  bio: string | null;
  followers: number | null;
  posts: number | null;
  thumbnails: string[];
  scrapedAt: string;
  isLive: boolean;
}

/**
 * Brand information for generating fallback data
 */
export interface BrandInfo {
  name: string;
  category: string;
  followerEstimate: number;
}

/**
 * Scrapes a single Instagram profile
 * Attempts to fetch public profile data from Instagram
 *
 * @param handle - Instagram handle (without @)
 * @returns ScrapedProfile object or null if scraping fails
 */
export async function scrapeProfile(handle: string): Promise<ScrapedProfile | null> {
  const url = `https://www.instagram.com/${handle}/`;
  const timeout = 5000; // 5 second timeout

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Failed to fetch ${handle}: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const profilePic = extractProfilePicUrl($);
    const bio = extractBio($);
    const followers = extractFollowerCount($);
    const posts = extractPostCount($);
    const thumbnails = extractThumbnails($);

    return {
      handle,
      profilePic,
      bio,
      followers,
      posts,
      thumbnails,
      scrapedAt: new Date().toISOString(),
      isLive: true,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.warn(`Timeout scraping ${handle}`);
      } else {
        console.warn(`Error scraping ${handle}:`, error.message);
      }
    }
    return null;
  }
}

export function generateFallbackData(
  handle: string,
  brand: BrandInfo
): ScrapedProfile {
  const profilePic = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    brand.name
  )}&size=150&background=6366f1&color=fff`;

  const bio = generateBio(brand);
  const thumbnails = generateThumbnails(handle, 12);

  return {
    handle,
    profilePic,
    bio,
    followers: brand.followerEstimate,
    posts: generateRealisticPostCount(brand.followerEstimate),
    thumbnails,
    scrapedAt: new Date().toISOString(),
    isLive: false,
  };
}

export async function scrapeMultiple(
  handles: Array<{ handle: string; name: string; category: string; followerEstimate: number }>,
  concurrency: number = 3
): Promise<ScrapedProfile[]> {
  const results: ScrapedProfile[] = [];
  const delay = 1000;

  for (let i = 0; i < handles.length; i += concurrency) {
    const batch = handles.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const scraped = await scrapeProfile(item.handle);

        if (scraped) {
          return scraped;
        } else {
          return generateFallbackData(item.handle, {
            name: item.name,
            category: item.category,
            followerEstimate: item.followerEstimate,
          });
        }
      })
    );

    results.push(...batchResults);

    if (i + concurrency < handles.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return results;
}

function extractProfilePicUrl($: cheerio.CheerioAPI): string | null {
  try {
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) return ogImage;
    const profileImg = $('img[alt*="profile"], img[alt*="avatar"]').first().attr('src');
    if (profileImg) return profileImg;
    return null;
  } catch { return null; }
}

function extractBio($: cheerio.CheerioAPI): string | null {
  try {
    const ogDescription = $('meta[property="og:description"]').attr('content');
    if (ogDescription) return ogDescription;
    const bioText = $('[data-testid="bio"]').text() || $('[data-testid="profile-bio"]').text();
    if (bioText) return bioText.trim();
    return null;
  } catch { return null; }
}

function extractFollowerCount($: cheerio.CheerioAPI): number | null {
  try {
    const followerText = $('[title*="follower"], [aria-label*="follower"]').first().attr('title') || $('[title*="follower"], [aria-label*="follower"]').first().attr('aria-label');
    if (followerText) {
      const match = followerText.match(/[\d,]+/);
      if (match) return parseInt(match[0].replace(/,/g, ''), 10);
    }
    return null;
  } catch { return null; }
}

function extractPostCount($: cheerio.CheerioAPI): number | null {
  try {
    const postText = $('[title*="post"], [aria-label*="post"]').first().attr('title') || $('[title*="post"], [aria-label*="post"]').first().attr('aria-label');
    if (postText) {
      const match = postText.match(/[\d,]+/);
      if (match) return parseInt(match[0].replace(/,/g, ''), 10);
    }
    return null;
  } catch { return null; }
}

function extractThumbnails($: cheerio.CheerioAPI): string[] {
  try {
    const thumbnails: string[] = [];
    $('img[alt*="post"], img[alt*="carousel"]').each((_, element) => {
      const src = $(element).attr('src');
      if (src && !src.includes('profile')) thumbnails.push(src);
    });
    return thumbnails.slice(0, 12);
  } catch { return []; }
}

function generateBio(brand: BrandInfo): string {
  const bios: Record<string, string[]> = {
    eyewear: [
      brand.name + ' | Premium eyewear for every lifestyle',
      brand.name + ' | Frames. Style. Vision.',
      'Official ' + brand.name + ' account | Designer eyewear',
      brand.name + ' | Celebrating individuality through vision',
    ],
    fashion: [
      brand.name + ' | Official brand account',
      brand.name + ' | Style starts here',
      brand.name + ' | Fashion forward since day one',
      'Shop the latest from ' + brand.name,
    ],
    lifestyle: [
      brand.name + ' | Live your best life',
      brand.name + ' | Inspiring moments daily',
      brand.name + ' | Where lifestyle meets quality',
      'Official ' + brand.name + ' | Welcome to our world',
    ],
    retail: [
      brand.name + ' | Shop now',
      brand.name + ' | Official retailer',
      brand.name + ' | Quality products, unbeatable prices',
      'Welcome to ' + brand.name + ' | Follow for updates',
    ],
  };
  const category = (brand.category || 'retail').toLowerCase();
  const bioOptions = bios[category] || bios.retail;
  return bioOptions[Math.floor(Math.random() * bioOptions.length)];
}

function generateThumbnails(handle: string, count: number = 12): string[] {
  const thumbnails: string[] = [];
  const seed = handle.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  for (let i = 0; i < count; i++) {
    const imageId = (seed + i) % 1000;
    const width = 300 + (imageId % 50);
    const height = 300 + ((imageId * 7) % 50);
    const url = 'https://picsum.photos/' + width + '/' + height + '?random=' + seed + '_' + i;
    thumbnails.push(url);
  }
  return thumbnails;
}

function generateRealisticPostCount(followerCount: number): number {
  if (followerCount < 1000) return Math.floor(50 + Math.random() * 150);
  else if (followerCount < 10000) return Math.floor(200 + Math.random() * 400);
  else if (followerCount < 100000) return Math.floor(500 + Math.random() * 800);
  else return Math.floor(1000 + Math.random() * 2000);
}
