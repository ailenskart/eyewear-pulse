import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { runAgent, isMindcaseConfigured, type MindcaseIgPost } from '@/lib/mindcase';
import { downloadMedia, uploadToBlob, fetchIgVideoUrl } from '@/lib/blob';
import {
  toDbRow,
  upsertPosts,
  logCronRun,
  type RawScrapedPost,
  type IgPostDbRow,
} from '@/lib/feed-db';

/**
 * Tiered Instagram rescrape powered by Mindcase (docs.mindcase.co).
 *
 * Parallel to /api/cron/rescrape (which uses Apify). Same tiers, same
 * dedup, same blob-upload step, same upsert target. Safe to run either
 * in place of — or alongside — the Apify cron.
 *
 * Auth: ?key=<CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>
 *
 *   GET /api/cron/mindcase-instagram?key=xxx&tier=fast
 *   GET /api/cron/mindcase-instagram?key=xxx&tier=full&limit=5   (smoke test)
 */

export const maxDuration = 800;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';
const MAX_VIDEO_MB = 20;
const BATCH_SIZE = 15;

/* ─── Tier handle lists (mirror the Apify cron) ─── */

const FAST_HANDLES: string[] = [
  'lenskart','johnjacobseyewear','vincentchase','warbyparker','rayban','oakley',
  'gucci','dior','prada','chanelofficial','tomford','versace','burberry','fendi',
  'gentlemonster','oliverpeoples','persol','moscot','cutlerandgross','retrosuperfuture',
  'mauijim','costasunglasses','aceandtate','goodr','knockaround','quay','sunniesstudios',
  'ditaeyewear','krewe','thierrylasry',
];

const MID_HANDLES: string[] = [
  'rayban','gucci','dior','prada','chanelofficial','tomford','versace','burberry','fendi','giorgioarmani',
  'celine','balenciaga','maisonvalentino','balmain','dolcegabbana','off____white','jacquemus','bottegaveneta','loewe','givenchyofficial',
  'louisvuitton','hermes','saintlaurent','chloe','miumiu','valentino','moncler','brioni','zegna','berluti',
  'warbyparker','zennioptical','eyebuydirect','paireyewear','felixgrayglasses','glassesusa','liingoeyewear',
  'fitzframes','yesglasses','zeelool','payneglasses','revantoptics','thinoptics','eyebobs','mouqy','coastalcom','lensabl',
  'aceandtate','jimmyfairly','misterspex','bonlook','cubitts','bloobloom','olliequinn','finlayandco','taylormorris',
  'arlo.wolf','barnerbrand','iolla','lookoptic','lapaireglasses','polette_eyewear','sensee','visiondirect','lenstore',
  'komono','lindbergeyewear','silhouette_eyewear','mykitaofficial','icberlin','etniabarcelona','ombraz','retrosuperfuture',
  'vehla','lespecs','quay','sunniesstudios','baileynelson','oscarwylee','vooglam','zoff_eyewear','owndays_official',
  'lenskart','johnjacobseyewear','vincentchase','titaneyeplus','coolwinks','eyewearlabs','cleardekho',
  'oakley','smithoptics','costasunglasses','mauijim','revosunglasses','spyoptic','rudyprojectna','pocsports','julbo_eyewear','bolleeyewear',
  'nativeeyewear','kaenon','bajio','nikevision','adidaseyewear',
];

function baseHandlesForTier(tier: string): string[] {
  if (tier === 'fast') return FAST_HANDLES;
  if (tier === 'mid') return MID_HANDLES;
  return Array.from(new Set([...MID_HANDLES])); // full pulls from DB below
}

async function mergedHandlesForTier(tier: string): Promise<string[]> {
  const base = baseHandlesForTier(tier);
  try {
    const client = supabaseServer();
    let q = client.from('tracked_brands').select('handle').eq('active', true);
    if (tier === 'fast') q = q.eq('tier', 'fast');
    else if (tier === 'mid') q = q.in('tier', ['fast', 'mid']);
    const { data } = await q;
    const uploaded = (data || []).map((r: { handle: string }) => r.handle.toLowerCase());
    return Array.from(new Set([...base, ...uploaded]));
  } catch {
    return base;
  }
}

/* ─── Mindcase → Apify-shaped row ─── */
/* Mindcase's IG posts agent actually returns PascalCase-with-spaces
   keys (despite the snake_case examples in the docs): "Post ID",
   "Owner", "Display Image", "Posted At", "Short Code", etc. We accept
   both shapes so the normalizer keeps working if they ever rename. */

function pick<T>(row: Record<string, unknown>, keys: string[], fallback?: T): T | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return fallback;
}

function normalizeMindcasePost(raw: MindcaseIgPost | Record<string, unknown>): RawScrapedPost {
  const m = raw as Record<string, unknown>;
  const id = pick<string>(m, ['Post ID', 'id', 'post_id', 'Short Code', 'shortCode', 'shortcode']) || '';
  const shortCode = pick<string>(m, ['Short Code', 'shortCode', 'shortcode']);
  const ownerUsername = String(pick<string>(m, ['Owner', 'ownerUsername', 'owner_username', 'username']) || '').toLowerCase();
  const displayUrl = pick<string>(m, ['Display Image', 'displayUrl', 'display_url', 'media_url']);
  const videoUrl = pick<string>(m, ['Video URL', 'videoUrl', 'video_url']);
  const timestamp = pick<string>(m, ['Posted At', 'timestamp', 'posted_at']);
  const likes = pick<number>(m, ['Likes', 'likesCount', 'likes', 'likes_count']) ?? 0;
  const comments = pick<number>(m, ['Comments', 'commentsCount', 'comments', 'comments_count']) ?? 0;
  const postType = pick<string>(m, ['Post Type', 'type']);
  const postUrl = pick<string>(m, ['Post URL', 'url', 'post_url']);
  const hashtags = (pick<string[]>(m, ['Hashtags', 'hashtags']) || []) as string[];
  const mentions = (pick<string[]>(m, ['Mentions', 'mentions']) || []) as string[];
  const videoPlays = pick<number>(m, ['Video Plays', 'videoPlays', 'video_plays', 'plays']);
  const videoViews = pick<number>(m, ['Video Views', 'videoViews', 'video_views', 'views']);

  // Carousel children — docs show `Child Posts` sometimes. Stay defensive.
  const rawChildren = (pick<unknown[]>(m, ['Child Posts', 'childPosts', 'child_posts']) || []) as Array<Record<string, unknown>>;
  const childPosts = rawChildren.map(c => ({
    id: String(c['Post ID'] || c.id || ''),
    type: String(c['Post Type'] || c.type || 'Image'),
    displayUrl: (c['Display Image'] || c.displayUrl || c.display_url) as string | undefined,
    videoUrl: (c['Video URL'] || c.videoUrl || c.video_url) as string | undefined,
  }));

  return {
    id: String(id),
    shortCode,
    caption: String(pick<string>(m, ['Caption', 'caption']) || ''),
    url: postUrl,
    commentsCount: Number(comments) || 0,
    likesCount: Number(likes) || 0,
    displayUrl,
    timestamp,
    ownerUsername,
    ownerFullName: pick<string>(m, ['Owner Name', 'ownerFullName', 'full_name']),
    hashtags,
    mentions,
    type: postType,
    videoUrl,
    videoPlays: typeof videoPlays === 'number' ? videoPlays : undefined,
    videoViews: typeof videoViews === 'number' ? videoViews : undefined,
    childPosts,
  };
}

/* ─── Blob upload (reuse shared helper) ─── */

async function uploadPostMedia(post: RawScrapedPost): Promise<{ image: boolean; video: boolean; slides: number }> {
  let image = false, video = false, slides = 0;
  const pid = String(post.id || post.shortCode || 'x');

  if (!post.blobUrl) {
    const imgUrl = (post.images?.[0]) || post.displayUrl;
    if (imgUrl) {
      const data = await downloadMedia(imgUrl);
      if (data) {
        const blobUrl = await uploadToBlob(data, `posts/${pid}.jpg`, 'image/jpeg');
        if (blobUrl) { post.blobUrl = blobUrl; image = true; }
      }
    }
  }

  // Mindcase's IG Posts agent doesn't expose video_url. When the
  // post is a Video/Reel we recover the MP4 URL from Instagram's
  // public embed page and blob-host it. Best-effort — IG may rate
  // limit, in which case we keep the poster thumbnail and skip.
  const isVideoPost = post.type === 'Video' || post.type === 'Reel' || !!post.videoUrl;
  if (isVideoPost && !post.videoBlobUrl) {
    let mp4 = post.videoUrl;
    if (!mp4 && post.shortCode) {
      const found = await fetchIgVideoUrl(post.shortCode).catch(() => null);
      if (found) { mp4 = found; post.videoUrl = found; }
    }
    if (mp4) {
      const data = await downloadMedia(mp4);
      if (data && data.byteLength < MAX_VIDEO_MB * 1024 * 1024) {
        const blobUrl = await uploadToBlob(data, `posts/video_${pid}.mp4`, 'video/mp4');
        if (blobUrl) { post.videoBlobUrl = blobUrl; video = true; }
      }
    }
  }

  const children = post.childPosts || [];
  if (children.length > 0 && !post.carouselSlides) {
    const out: Array<{ url: string; type: string }> = [];
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      if (child.displayUrl) {
        const data = await downloadMedia(child.displayUrl);
        if (data) {
          const cid = child.id || `${pid}_${j}`;
          const blobUrl = await uploadToBlob(data, `posts/slide_${cid}.jpg`, 'image/jpeg');
          if (blobUrl) out.push({ url: blobUrl, type: child.type || 'Image' });
        }
      }
    }
    if (out.length > 0) { post.carouselSlides = out; slides = out.length; }
  }

  return { image, video, slides };
}

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
  if (!isMindcaseConfigured()) {
    return NextResponse.json({ error: 'MINDCASE_API_KEY not set' }, { status: 500 });
  }

  const tier = (request.nextUrl.searchParams.get('tier') || 'fast').toLowerCase();
  const limitOverride = parseInt(request.nextUrl.searchParams.get('limit') || '0');
  const postsPerBrand = parseInt(request.nextUrl.searchParams.get('postsPerBrand') || '0')
    || (tier === 'full' ? 15 : 10);
  const onlyNewerThan = request.nextUrl.searchParams.get('onlyPostsNewerThan') || undefined;
  const handlesOverride = request.nextUrl.searchParams.get('handles');
  const skipDedup = request.nextUrl.searchParams.get('skipDedup') === '1';
  // Pagination — slice the tier handle list so a cron caller can walk
  // through a 3,000-brand list in multiple invocations without blowing
  // past Vercel's 800s function limit. Default: start=0, count=all.
  const start = Math.max(0, parseInt(request.nextUrl.searchParams.get('start') || '0'));
  const countParam = parseInt(request.nextUrl.searchParams.get('count') || '0');
  // Soft wall-clock budget — stop launching new Mindcase calls once we
  // burn through it so Vercel doesn't kill the function mid-batch.
  const softBudgetMs = Math.max(30_000, parseInt(request.nextUrl.searchParams.get('softBudgetMs') || '600000'));

  // `handles` override: pass a comma-separated list to target specific
  // brands (for smoke tests / on-demand scrapes); otherwise use tier list.
  const allHandles = handlesOverride
    ? handlesOverride.split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
    : await mergedHandlesForTier(tier);
  const sliced = countParam > 0 ? allHandles.slice(start, start + countParam) : allHandles.slice(start);
  const working = limitOverride > 0 ? sliced.slice(0, limitOverride) : sliced;

  const startedAt = Date.now();
  const existingIds = skipDedup ? new Set<string>() : await fetchExistingIds(working);

  const results = {
    tier,
    source: 'mindcase' as const,
    start,
    brandsPool: allHandles.length,
    batchesRun: 0,
    brandsHit: working.length,
    brandsProcessed: 0,
    newPosts: 0,
    imagesUploaded: 0,
    videosUploaded: 0,
    slidesUploaded: 0,
    inserted: 0,
    insertErrors: [] as string[],
    errors: [] as string[],
    stoppedEarly: false,
  };

  for (let i = 0; i < working.length; i += BATCH_SIZE) {
    if (Date.now() - startedAt > softBudgetMs) {
      results.stoppedEarly = true;
      break;
    }
    const batch = working.slice(i, i + BATCH_SIZE);
    const batchRows: IgPostDbRow[] = [];
    try {
      const { data } = await runAgent<MindcaseIgPost>('instagram/posts', {
        usernames: batch,
        resultsLimit: postsPerBrand,
        ...(onlyNewerThan ? { onlyPostsNewerThan: onlyNewerThan } : {}),
      }, { timeoutSec: 600 });

      for (const raw of data) {
        const post = normalizeMindcasePost(raw);
        if (!post.id || existingIds.has(post.id) || !post.ownerUsername) continue;

        const media = await uploadPostMedia(post);
        if (media.image) results.imagesUploaded++;
        if (media.video) results.videosUploaded++;
        results.slidesUploaded += media.slides;

        const row = toDbRow(post);
        if (row) {
          batchRows.push(row);
          existingIds.add(post.id);
          results.newPosts++;
        }
      }
      results.batchesRun++;
      results.brandsProcessed = i + batch.length;
    } catch (err) {
      results.errors.push(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    // Commit after EACH batch so we don't lose work if Vercel kills
    // the function on the next batch. Previously we buffered all rows
    // in memory and wrote at the end — meaning a 800s timeout on a
    // 3,000-brand crawl threw away 200 batches of successful scrapes.
    if (batchRows.length > 0) {
      const res = await upsertPosts(batchRows);
      results.inserted += res.inserted;
      if (res.error) results.insertErrors.push(res.error);

      try {
        const scrapedHandles = Array.from(new Set(batchRows.map(r => r.brand_handle)));
        if (scrapedHandles.length > 0) {
          const client = supabaseServer();
          await client
            .from('tracked_brands')
            .update({ last_scraped_at: new Date().toISOString() })
            .in('handle', scrapedHandles);
        }
      } catch { /* non-fatal */ }
    }
  }

  const durationMs = Date.now() - startedAt;
  await logCronRun({
    tier: `mindcase:${tier}`,
    brandsHit: results.brandsHit,
    newPosts: results.inserted,
    durationMs,
    error: results.insertErrors.length > 0
      ? results.insertErrors.join(' | ')
      : (results.errors.length > 0 ? results.errors.join(' | ') : undefined),
  });

  const nextStart = results.stoppedEarly
    ? start + results.brandsProcessed
    : (countParam > 0 && start + results.brandsProcessed < allHandles.length
        ? start + results.brandsProcessed
        : null);

  return NextResponse.json({
    success: true,
    ...results,
    durationMs,
    nextStart,
    message: `mindcase-${tier} rescrape done. ${results.inserted}/${results.newPosts} new posts in ${Math.round(durationMs / 1000)}s.`,
  });
}
