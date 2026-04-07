/**
 * Apify Instagram Scraper — batch scrape + immediate media upload
 *
 * Usage:
 *   APIFY_TOKEN=xxx BLOB_READ_WRITE_TOKEN=xxx npx tsx scripts/scrape-brands.ts
 *
 * Scrapes posts from eyewear brand accounts, then immediately downloads
 * and uploads all images, carousel slides, and videos to Vercel Blob
 * before Instagram CDN URLs expire.
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!APIFY_TOKEN || !BLOB_TOKEN) {
  console.error('Required env vars: APIFY_TOKEN, BLOB_READ_WRITE_TOKEN');
  process.exit(1);
}

const ACTOR_ID = 'shu8hvrXbJbY3Eb9W';
const POSTS_PER_BRAND = 5;
const BATCH_SIZE = 10;
const WAIT_TIMEOUT = 300;
const MAX_VIDEO_MB = 20;
const DATA_DIR = join(process.cwd(), 'src', 'data');
const FEED_FILE = join(DATA_DIR, 'scraped-feed.json');

/* ── Brand list ─────────────────────────────────────────────────── */

const BRANDS = [
  // Luxury
  { handle: 'rayban', name: 'Ray-Ban', category: 'Luxury', region: 'Europe', priceRange: '$$' },
  { handle: 'gucci', name: 'Gucci', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'dior', name: 'Dior', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'prada', name: 'Prada', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'chanelofficial', name: 'Chanel', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'tomford', name: 'Tom Ford', category: 'Luxury', region: 'North America', priceRange: '$$$$' },
  { handle: 'versace', name: 'Versace', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'burberry', name: 'Burberry', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'fendi', name: 'Fendi', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'giorgioarmani', name: 'Giorgio Armani', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  // D2C
  { handle: 'warbyparker', name: 'Warby Parker', category: 'D2C', region: 'North America', priceRange: '$$' },
  { handle: 'zennioptical', name: 'Zenni', category: 'D2C', region: 'North America', priceRange: '$' },
  { handle: 'eyebuydirect', name: 'EyeBuyDirect', category: 'D2C', region: 'North America', priceRange: '$' },
  { handle: 'lenskart', name: 'Lenskart', category: 'D2C', region: 'South Asia', priceRange: '$' },
  { handle: 'aceandtate', name: 'Ace & Tate', category: 'D2C', region: 'Europe', priceRange: '$$' },
  { handle: 'jimmyfairly', name: 'Jimmy Fairly', category: 'D2C', region: 'Europe', priceRange: '$$' },
  { handle: 'misterspex', name: 'Mr Spex', category: 'D2C', region: 'Europe', priceRange: '$$' },
  { handle: 'quay', name: 'Quay', category: 'D2C', region: 'Oceania', priceRange: '$$' },
  { handle: 'sunniesstudios', name: 'Sunnies Studios', category: 'D2C', region: 'Southeast Asia', priceRange: '$' },
  { handle: 'diffeyewear', name: 'Diff Eyewear', category: 'D2C', region: 'North America', priceRange: '$$' },
  // Sports
  { handle: 'oakley', name: 'Oakley', category: 'Sports', region: 'North America', priceRange: '$$' },
  { handle: 'costasunglasses', name: 'Costa', category: 'Sports', region: 'North America', priceRange: '$$' },
  { handle: 'mauijim', name: 'Maui Jim', category: 'Sports', region: 'North America', priceRange: '$$$' },
  { handle: 'goodr', name: 'Goodr', category: 'Streetwear', region: 'North America', priceRange: '$' },
  { handle: 'pitviper', name: 'Pit Viper', category: 'Streetwear', region: 'North America', priceRange: '$' },
  // Independent
  { handle: 'gentlemonster', name: 'Gentle Monster', category: 'Independent', region: 'East Asia', priceRange: '$$$' },
  { handle: 'oliverpeoples', name: 'Oliver Peoples', category: 'Independent', region: 'North America', priceRange: '$$$' },
  { handle: 'moscotnyc', name: 'MOSCOT', category: 'Independent', region: 'North America', priceRange: '$$$' },
  { handle: 'persol', name: 'Persol', category: 'Heritage', region: 'Europe', priceRange: '$$$' },
  { handle: 'ditaeyewear', name: 'DITA', category: 'Independent', region: 'North America', priceRange: '$$$$' },
];

/* ── Helpers ─────────────────────────────────────────────────────── */

function curlJson(args: string): unknown {
  const result = execSync(`curl -s ${args}`, { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }).toString();
  return JSON.parse(result);
}

function uploadToBlob(localPath: string, blobPath: string, contentType: string): string | null {
  try {
    const result = execSync(`curl -s -X PUT "https://blob.vercel-storage.com/${blobPath}" \
      -H "Authorization: Bearer ${BLOB_TOKEN}" \
      -H "x-api-version: 7" \
      -H "Content-Type: ${contentType}" \
      -H "x-content-type: ${contentType}" \
      --data-binary "@${localPath}"`, { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }).toString();
    const data = JSON.parse(result);
    return data.url || null;
  } catch {
    return null;
  }
}

function downloadFile(url: string, dest: string, timeoutSec = 30): boolean {
  try {
    execSync(`curl -s -o "${dest}" -L --max-time ${timeoutSec} "${url}"`, { timeout: (timeoutSec + 5) * 1000 });
    return existsSync(dest) && statSync(dest).size > 500;
  } catch {
    return false;
  }
}

interface ScrapedPost {
  id?: string;
  shortCode?: string;
  caption?: string;
  url?: string;
  commentsCount?: number;
  likesCount?: number;
  displayUrl?: string;
  images?: string[];
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  hashtags?: string[];
  type?: string;
  videoUrl?: string;
  inputUrl?: string;
  childPosts?: Array<{ id?: string; type?: string; displayUrl?: string; videoUrl?: string }>;
  // Added by this script
  blobUrl?: string;
  videoBlobUrl?: string;
  carouselSlides?: Array<{ url: string; type: string }>;
}

/* ── Upload all media for a post immediately ─────────────────────── */

function uploadPostMedia(post: ScrapedPost): void {
  const pid = String(post.id || post.shortCode || 'x');
  const tmp = `/tmp/media_${pid}`;

  // 1. Main image
  const imgUrl = (post.images?.[0]) || post.displayUrl;
  if (imgUrl && !post.blobUrl) {
    const dest = `${tmp}_main.jpg`;
    if (downloadFile(imgUrl, dest)) {
      const blobUrl = uploadToBlob(dest, `posts/${pid}.jpg`, 'image/jpeg');
      if (blobUrl) post.blobUrl = blobUrl;
      try { unlinkSync(dest); } catch {}
    }
  }

  // 2. Video
  if (post.videoUrl && !post.videoBlobUrl) {
    const dest = `${tmp}_video.mp4`;
    if (downloadFile(post.videoUrl, dest, 45)) {
      const sizeMb = statSync(dest).size / 1024 / 1024;
      if (sizeMb <= MAX_VIDEO_MB) {
        const blobUrl = uploadToBlob(dest, `posts/video_${pid}.mp4`, 'video/mp4');
        if (blobUrl) post.videoBlobUrl = blobUrl;
      }
      try { unlinkSync(dest); } catch {}
    }
  }

  // 3. Carousel slides
  const children = post.childPosts || [];
  if (children.length > 0 && !post.carouselSlides) {
    const slides: Array<{ url: string; type: string }> = [];
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      const childUrl = child.displayUrl;
      if (!childUrl) continue;

      const childId = child.id || `${pid}_${j}`;
      const dest = `${tmp}_slide_${j}.jpg`;
      if (downloadFile(childUrl, dest)) {
        const blobUrl = uploadToBlob(dest, `posts/slide_${childId}.jpg`, 'image/jpeg');
        if (blobUrl) {
          slides.push({ url: blobUrl, type: child.type || 'Image' });
        }
        try { unlinkSync(dest); } catch {}
      }
    }
    if (slides.length > 0) post.carouselSlides = slides;
  }
}

/* ── Main ────────────────────────────────────────────────────────── */

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  // Load existing data
  let existing: ScrapedPost[] = [];
  if (existsSync(FEED_FILE)) {
    existing = JSON.parse(readFileSync(FEED_FILE, 'utf-8'));
  }
  const existingIds = new Set(existing.map(p => String(p.id || '')));

  console.log(`Existing posts: ${existing.length}`);
  console.log(`Scraping ${BRANDS.length} brands, ${POSTS_PER_BRAND} posts each...\n`);

  const newPosts: ScrapedPost[] = [];

  for (let i = 0; i < BRANDS.length; i += BATCH_SIZE) {
    const batch = BRANDS.slice(i, i + BATCH_SIZE);
    const urls = batch.map(b => `https://www.instagram.com/${b.handle}/`);
    const urlsJson = JSON.stringify(urls);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(BRANDS.length / BATCH_SIZE);

    console.log(`\n=== Batch ${batchNum}/${totalBatches}: ${batch.map(b => b.handle).join(', ')} ===`);

    try {
      // Start Apify run
      const body = JSON.stringify({ directUrls: JSON.parse(urlsJson), resultsType: 'posts', resultsLimit: POSTS_PER_BRAND });
      const runResult = curlJson(
        `-X POST "https://api.apify.com/v2/acts/${ACTOR_ID}/runs?waitForFinish=${WAIT_TIMEOUT}" ` +
        `-H "Authorization: Bearer ${APIFY_TOKEN}" ` +
        `-H "Content-Type: application/json" ` +
        `-d '${body}'`
      ) as { data: { status: string; defaultDatasetId: string; chargedEventCounts?: Record<string, number> } };

      const run = runResult.data;
      console.log(`  Status: ${run.status} | Results: ${JSON.stringify(run.chargedEventCounts || {})}`);

      if (run.status !== 'SUCCEEDED') continue;

      // Fetch dataset
      const posts = curlJson(
        `"https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?limit=500" ` +
        `-H "Authorization: Bearer ${APIFY_TOKEN}"`
      ) as ScrapedPost[];

      console.log(`  Got ${posts.length} posts — uploading media immediately...`);

      // Upload media for each post RIGHT AWAY (before CDN expires)
      let mediaCount = 0;
      for (const post of posts) {
        if (existingIds.has(String(post.id || ''))) continue;

        // Fix -1 likes
        if ((post.likesCount ?? 0) < 0) post.likesCount = 0;
        if ((post.commentsCount ?? 0) < 0) post.commentsCount = 0;

        uploadPostMedia(post);
        mediaCount++;
        if (mediaCount % 5 === 0) process.stdout.write('.');
        newPosts.push(post);
        existingIds.add(String(post.id || ''));
      }
      console.log(`\n  Uploaded media for ${mediaCount} new posts`);

    } catch (err) {
      console.error(`  ERROR:`, err instanceof Error ? err.message : err);
    }

    // Delay between batches
    if (i + BATCH_SIZE < BRANDS.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Merge and save
  const merged = [...existing, ...newPosts];
  writeFileSync(FEED_FILE, JSON.stringify(merged, null, 0));

  console.log(`\n========================================`);
  console.log(`New posts: ${newPosts.length}`);
  console.log(`Total posts: ${merged.length}`);
  console.log(`Unique accounts: ${new Set(merged.map(p => p.ownerUsername || '')).size}`);
  console.log(`Saved to ${FEED_FILE}`);
}

main().catch(console.error);
