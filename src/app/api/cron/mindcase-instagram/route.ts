import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { runAgent, isMindcaseConfigured, type MindcaseIgPost } from '@/lib/mindcase';
import { downloadMedia, uploadToBlob } from '@/lib/blob';
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

function normalizeMindcasePost(m: MindcaseIgPost): RawScrapedPost {
  const id = m.id || m.shortCode || m.shortcode || '';
  const ownerUsername = (m.ownerUsername || m.owner_username || m.username || '').toLowerCase();
  const displayUrl = m.displayUrl || m.display_url || m.media_url || (m.images && m.images[0]) || undefined;
  const videoUrl = m.videoUrl || m.video_url || undefined;
  const timestamp = m.timestamp || m.posted_at || undefined;
  const likes = m.likesCount ?? m.likes ?? m.likes_count ?? 0;
  const comments = m.commentsCount ?? m.comments ?? m.comments_count ?? 0;

  const rawChildren = m.childPosts || m.child_posts || [];
  const childPosts = rawChildren.map(c => ({
    id: c.id,
    type: c.type,
    displayUrl: (c as { displayUrl?: string; display_url?: string }).displayUrl
      || (c as { display_url?: string }).display_url,
    videoUrl: (c as { videoUrl?: string; video_url?: string }).videoUrl
      || (c as { video_url?: string }).video_url,
  }));

  return {
    id: String(id),
    shortCode: m.shortCode || m.shortcode,
    caption: m.caption || '',
    url: m.url || m.post_url,
    commentsCount: Number(comments) || 0,
    likesCount: Number(likes) || 0,
    displayUrl,
    timestamp,
    ownerUsername,
    ownerFullName: m.ownerFullName || m.full_name,
    hashtags: m.hashtags || [],
    mentions: m.mentions || [],
    type: m.type,
    videoUrl,
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

  if (post.videoUrl && !post.videoBlobUrl) {
    const data = await downloadMedia(post.videoUrl);
    if (data && data.byteLength < MAX_VIDEO_MB * 1024 * 1024) {
      const blobUrl = await uploadToBlob(data, `posts/video_${pid}.mp4`, 'video/mp4');
      if (blobUrl) { post.videoBlobUrl = blobUrl; video = true; }
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
  const postsPerBrand = tier === 'full' ? 15 : 10;
  const onlyNewerThan = request.nextUrl.searchParams.get('onlyPostsNewerThan') || undefined;

  const handles = await mergedHandlesForTier(tier);
  const working = limitOverride > 0 ? handles.slice(0, limitOverride) : handles;

  const startedAt = Date.now();
  const existingIds = await fetchExistingIds(working);
  const newRows: IgPostDbRow[] = [];

  const results = {
    tier,
    source: 'mindcase' as const,
    batchesRun: 0,
    brandsHit: working.length,
    newPosts: 0,
    imagesUploaded: 0,
    videosUploaded: 0,
    slidesUploaded: 0,
    errors: [] as string[],
  };

  for (let i = 0; i < working.length; i += BATCH_SIZE) {
    const batch = working.slice(i, i + BATCH_SIZE);
    try {
      const { data } = await runAgent<MindcaseIgPost>('instagram/posts', {
        username: batch,
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
          newRows.push(row);
          existingIds.add(post.id);
          results.newPosts++;
        }
      }
      results.batchesRun++;
    } catch (err) {
      results.errors.push(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  let upsertResult: { inserted: number; error?: string } = { inserted: 0 };
  if (newRows.length > 0) {
    upsertResult = await upsertPosts(newRows);
  }

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
    tier: `mindcase:${tier}`,
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
    message: `mindcase-${tier} rescrape done. ${upsertResult.inserted}/${results.newPosts} new posts in ${Math.round(durationMs / 1000)}s.`,
  });
}
