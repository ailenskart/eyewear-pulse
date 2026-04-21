import { NextRequest, NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import { supabaseServer } from '@/lib/supabase';
import { isApifyConfigured } from '@/lib/apify';
import { env } from '@/lib/env';
import { toDbRow, upsertPosts, logCronRun, type RawScrapedPost, type IgPostDbRow } from '@/lib/feed-db';

/**
 * Tiered rescrape cron — keeps the Instagram feed fresh without
 * burning through Apify credits on every run.
 *
 * Tiers (picked via `?tier=`):
 *   - fast  (hourly)    — top ~30 priority brands
 *   - mid   (every 6h)  — D2C + Luxury + key Sports (~100 brands)
 *   - full  (daily)     — all 273 brands
 *
 * Each run:
 *   1. Picks its brand list for the tier
 *   2. Runs Apify actor in batches of 15 brands with up to 10
 *      posts per brand (fast/mid) or 15 per brand (full)
 *   3. Uploads new image/video/carousel media to Vercel Blob so the
 *      feed renders even if IG CDN URLs expire
 *   4. Upserts into the `ig_posts` Supabase table
 *   5. Writes a `feed_cron_runs` row so the UI can show
 *      "last updated N minutes ago"
 *
 * Auth: ?key=<CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>
 *
 * Manual usage:
 *   GET /api/cron/rescrape?key=xxx&tier=fast
 *   GET /api/cron/rescrape?key=xxx&tier=full&limit=2      (smoke test)
 */

export const maxDuration = 800; // Vercel Pro caps functions at 900s; leave a buffer

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';
const ACTOR_ID = 'shu8hvrXbJbY3Eb9W';
const BATCH_SIZE = 15;
const MAX_VIDEO_MB = 20;

/* ─── Brand lists per tier ─── */

// Top 30 priority brands — hit every hour. Lenskart + John Jacobs first
// because this is an internal Lenskart tool.
const FAST_HANDLES: string[] = [
  'lenskart','johnjacobseyewear','vincentchase','warbyparker','rayban','oakley',
  'gucci','dior','prada','chanelofficial','tomford','versace','burberry','fendi',
  'gentlemonster','oliverpeoples','persol','moscot','cutlerandgross','retrosuperfuture',
  'mauijim','costasunglasses','aceandtate','goodr','knockaround','quay','sunniesstudios',
  'ditaeyewear','krewe','thierrylasry',
];

// D2C + Luxury + core sports — every 6 hours
const MID_HANDLES: string[] = [
  // Luxury
  'rayban','gucci','dior','prada','chanelofficial','tomford','versace','burberry','fendi','giorgioarmani',
  'celine','balenciaga','maisonvalentino','balmain','dolcegabbana','off____white','jacquemus','bottegaveneta','loewe','givenchyofficial',
  'louisvuitton','hermes','saintlaurent','chloe','miumiu','valentino','moncler','brioni','zegna','berluti',
  // D2C
  'warbyparker','zennioptical','eyebuydirect','paireyewear','felixgrayglasses','glassesusa','liingoeyewear',
  'fitzframes','yesglasses','zeelool','payneglasses','revantoptics','thinoptics','eyebobs','mouqy','coastalcom','lensabl',
  'aceandtate','jimmyfairly','misterspex','bonlook','cubitts','bloobloom','olliequinn','finlayandco','taylormorris',
  'arlo.wolf','barnerbrand','iolla','lookoptic','lapaireglasses','polette_eyewear','sensee','visiondirect','lenstore',
  'komono','lindbergeyewear','silhouette_eyewear','mykitaofficial','icberlin','etniabarcelona','ombraz','retrosuperfuture',
  'vehla','lespecs','quay','sunniesstudios','baileynelson','oscarwylee','vooglam','zoff_eyewear','owndays_official',
  'lenskart','johnjacobseyewear','vincentchase','titaneyeplus','coolwinks','eyewearlabs','cleardekho',
  // Sports / Performance
  'oakley','smithoptics','costasunglasses','mauijim','revosunglasses','spyoptic','rudyprojectna','pocsports','julbo_eyewear','bolleeyewear',
  'nativeeyewear','kaenon','bajio','nikevision','adidaseyewear',
];

// All handles — daily
const FULL_HANDLES: string[] = [
  ...new Set([
    ...MID_HANDLES,
    // extended indie + luxury
    'oliverpeoples','moscotnyc','gentlemonster','persol','jacquesmarimage','cutlerandgross','bartonperreira',
    'garrettleight','saltoptics','krewe','thierrylasry','ditaeyewear','lindafarrow','ahlemeyewear',
    'anneetvalentin','orgreen','fleye','neubau','matsudaeyewear','masunaga','robertmarc','leisuresociety',
    'theoeyewear','tavat','gold_wood','vavaeyewear','movitra_spectacles','moscot','rigards','kuboraum',
    // streetwear / lifestyle
    'goodr','pitviper','knockaround','blenderseyewear','shadyrays','sunski','hawkersco','9five','shwood','tomahawkshades',
    'nectarsunglasses','babiators','roshambobaby',
    // fast fashion
    'calvinklein','ralphlauren','tommyhilfiger','boss','coach','michaelkors','lacoste','katespadeny','toryburch','marcjacobs',
    'polaroid_eyewear','carrera','sunglasshut','lenscrafters','specsavers',
    // tech / smart
    'raybanmeta','spectacles','meta',
    // sustainable
    'sea2seeeyewear','dickmoby','karunworld','palaeyewear','proofeyewear','birdeyewear','zealoptics','ecoeyewear',
    'parafina',
    // kids
    'jonaspauleyewear','kidsociety_eyewear',
  ]),
];

function handlesForTier(tier: string): string[] {
  if (tier === 'fast') return FAST_HANDLES;
  if (tier === 'mid') return MID_HANDLES;
  return FULL_HANDLES;
}

/* ─── Merge hardcoded + user-uploaded handles from tracked_brands ─── */

async function mergedHandlesForTier(tier: string): Promise<string[]> {
  const base = handlesForTier(tier);
  try {
    const client = supabaseServer();
    // For 'fast' — only pull tier=fast uploads. For 'mid' — fast+mid. For 'full' — everything active.
    let q = client.from('tracked_brands').select('handle').eq('active', true);
    if (tier === 'fast') q = q.eq('tier', 'fast');
    else if (tier === 'mid') q = q.in('tier', ['fast', 'mid']);
    // full = all active
    const { data } = await q;
    const uploaded = (data || []).map((r: { handle: string }) => r.handle.toLowerCase());
    // Dedupe
    return Array.from(new Set([...base, ...uploaded]));
  } catch {
    return base;
  }
}

/* ─── Media upload helpers ─── */

async function uploadToBlob(data: ArrayBuffer, path: string, contentType: string): Promise<string | null> {
  const token = env.BLOB_READ_WRITE_TOKEN();
  if (!token) return null;
  try {
    const res = await fetch(`https://blob.vercel-storage.com/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-api-version': '7',
        'Content-Type': contentType,
        'x-content-type': contentType,
      },
      body: data,
    });
    const json = await res.json();
    return (json as { url?: string }).url || null;
  } catch {
    return null;
  }
}

async function downloadMedia(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 500 ? buf : null;
  } catch {
    return null;
  }
}

async function uploadPostMedia(post: RawScrapedPost): Promise<void> {
  const pid = String(post.id || post.shortCode || 'x');

  if (!post.blobUrl) {
    const imgUrl = (post.images?.[0]) || post.displayUrl;
    if (imgUrl) {
      const data = await downloadMedia(imgUrl);
      if (data) {
        const blobUrl = await uploadToBlob(data, `posts/${pid}.jpg`, 'image/jpeg');
        if (blobUrl) post.blobUrl = blobUrl;
      }
    }
  }

  if (post.videoUrl && !post.videoBlobUrl) {
    const data = await downloadMedia(post.videoUrl);
    if (data && data.byteLength < MAX_VIDEO_MB * 1024 * 1024) {
      const blobUrl = await uploadToBlob(data, `posts/video_${pid}.mp4`, 'video/mp4');
      if (blobUrl) post.videoBlobUrl = blobUrl;
    }
  }

  const children = post.childPosts || [];
  if (children.length > 0 && !post.carouselSlides) {
    const slides: Array<{ url: string; type: string }> = [];
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      if (child.displayUrl) {
        const data = await downloadMedia(child.displayUrl);
        if (data) {
          const cid = child.id || `${pid}_${j}`;
          const blobUrl = await uploadToBlob(data, `posts/slide_${cid}.jpg`, 'image/jpeg');
          if (blobUrl) slides.push({ url: blobUrl, type: child.type || 'Image' });
        }
      }
    }
    if (slides.length > 0) post.carouselSlides = slides;
  }
}

/* ─── Fetch known post IDs from Supabase (for dedup) ─── */

async function fetchExistingIds(handles: string[]): Promise<Set<string>> {
  const client = supabaseServer();
  const { data } = await client
    .from('brand_content')
    .select('source_ref')
    .eq('type', 'ig_post')
    .in('brand_handle', handles.map(h => h.toLowerCase()));
  return new Set((data || []).map((r: { source_ref: string }) => r.source_ref).filter(Boolean));
}

/* ─── Main handler ─── */

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  if (key !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isApifyConfigured()) {
    return NextResponse.json({ error: 'APIFY_TOKEN not set' }, { status: 500 });
  }

  const apify = new ApifyClient({ token: APIFY_TOKEN });

  const tier = (request.nextUrl.searchParams.get('tier') || 'fast').toLowerCase();
  const limitOverride = parseInt(request.nextUrl.searchParams.get('limit') || '0');
  const postsPerBrand = tier === 'full' ? 15 : 10;

  const handles = await mergedHandlesForTier(tier);
  const workingHandles = limitOverride > 0 ? handles.slice(0, limitOverride) : handles;

  const startedAt = Date.now();
  const existingIds = await fetchExistingIds(workingHandles);
  const newRows: IgPostDbRow[] = [];

  const results = {
    tier,
    batchesRun: 0,
    brandsHit: workingHandles.length,
    newPosts: 0,
    imagesUploaded: 0,
    videosUploaded: 0,
    slidesUploaded: 0,
    errors: [] as string[],
  };

  for (let i = 0; i < workingHandles.length; i += BATCH_SIZE) {
    const batch = workingHandles.slice(i, i + BATCH_SIZE);
    const urls = batch.map(h => `https://www.instagram.com/${h}/`);

    try {
      // Run via official SDK
      const run = await apify.actor(ACTOR_ID).call(
        { directUrls: urls, resultsType: 'posts', resultsLimit: postsPerBrand },
        { waitSecs: 300 },
      );

      if (!run || !run.defaultDatasetId) {
        results.errors.push(`Batch ${i / BATCH_SIZE + 1}: no dataset returned`);
        continue;
      }

      const { items } = await apify.dataset(run.defaultDatasetId).listItems({ limit: 500 });
      const posts = items as RawScrapedPost[];

      for (const post of posts) {
        const pid = String(post.id || '');
        if (!pid || existingIds.has(pid)) continue;
        if (!post.ownerUsername) continue;

        if ((post.likesCount ?? 0) < 0) post.likesCount = 0;
        if ((post.commentsCount ?? 0) < 0) post.commentsCount = 0;

        await uploadPostMedia(post);
        if (post.blobUrl) results.imagesUploaded++;
        if (post.videoBlobUrl) results.videosUploaded++;
        results.slidesUploaded += (post.carouselSlides?.length || 0);

        const row = toDbRow(post);
        if (row) {
          newRows.push(row);
          existingIds.add(pid);
          results.newPosts++;
        }
      }
      results.batchesRun++;
    } catch (err) {
      results.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // Upsert in one go
  let upsertResult: { inserted: number; error?: string } = { inserted: 0 };
  if (newRows.length > 0) {
    upsertResult = await upsertPosts(newRows);
  }

  // Mark scraped brands in tracked_brands so the UI can show "last scraped"
  try {
    const scrapedHandles = Array.from(new Set(newRows.map(r => r.brand_handle)));
    if (scrapedHandles.length > 0) {
      const client = supabaseServer();
      await client
        .from('tracked_brands')
        .update({ last_scraped_at: new Date().toISOString() })
        .in('handle', scrapedHandles);
    }
  } catch { /* non-fatal */ }

  const durationMs = Date.now() - startedAt;
  await logCronRun({
    tier,
    brandsHit: results.brandsHit,
    newPosts: upsertResult.inserted,
    durationMs,
    error: upsertResult.error || (results.errors.length > 0 ? results.errors.join(' | ') : undefined),
  });

  return NextResponse.json({
    success: true,
    ...results,
    inserted: upsertResult.inserted,
    upsertError: upsertResult.error,
    durationMs,
    message: `${tier} rescrape done. ${upsertResult.inserted}/${results.newPosts} new posts written to Supabase in ${Math.round(durationMs / 1000)}s.`,
  });
}
