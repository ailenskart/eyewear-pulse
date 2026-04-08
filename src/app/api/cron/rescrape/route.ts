import { NextRequest, NextResponse } from 'next/server';

/**
 * Daily rescrape cron job
 *
 * - Scrapes 10 posts per brand from 273 accounts via Apify
 * - Skips posts that are already in the feed (by ID)
 * - Downloads and uploads new images/videos/slides to Vercel Blob
 * - Triggered by Vercel Cron (see vercel.json) or manually via GET /api/cron/rescrape?key=xxx
 */

// Tokens imported from env vars
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const CRON_SECRET = process.env.CRON_SECRET || 'eyewear-pulse-cron-2026';
const ACTOR_ID = 'shu8hvrXbJbY3Eb9W';
const POSTS_PER_BRAND = 10;
const BATCH_SIZE = 15;
const MAX_VIDEO_MB = 20;

// All brand handles to scrape
const HANDLES: string[] = [
  // Luxury
  'rayban','gucci','dior','prada','chanelofficial','tomford','versace','burberry','fendi','giorgioarmani',
  'celine','balenciaga','maisonvalentino','balmain','dolcegabbana','off____white','jacquemus','bottegaveneta','loewe','givenchyofficial',
  // D2C
  'warbyparker','zennioptical','eyebuydirect','lenskart','aceandtate','jimmyfairly','misterspex','quay','sunniesstudios','diffeyewear',
  'bonlook','clearlyca','felixgrayglasses','izipizi','cubitts','paireyewear','lespecs','liingoeyewear','tens','topologyeyewear',
  'vehla','mooeyewear','priverevaux','vooglam','zoff_eyewear','birdeyewear','eyewearlabs','fitzframes','sodashades','baileynelson',
  'benandfrank','polette_eyewear','chillibeans','owndays_official','coolwinks','mellerband','stoggles','lohoeyewear','peppe.eyewear',
  '9five','caddislife','cleardekho','saturdays','shwood','tomahawkshades','aojo_eyewear','hubblecontacts','zeelool','39dollarglasses',
  'bloobloom','olliequinn','oscarwylee','glassesusa','mouqy','roka','yesglasses','johnjacobseyewear','vincentchase',
  'barnerbrand','dimeoptics','eyebobs','eyemyeye','feelgoodcontacts','finlayandco','genusee','glassesdirect','goggles4u','iolla',
  'jonaspauleyewear','karunworld','lapaireglasses','lensmart','lenstore','londonmole','lookoptic','mvmt','nectarsunglasses','noozoptics',
  'northweek','ombraz','oohspectacles','oppaglasses','palaeyewear','peculiareyewear','proofeyewear','raen','revantoptics',
  'sea2seeeyewear','sensee','specscart','wearesungod','tapole_eyewear','taylormorris','thinoptics','visiondirect','viueyewear',
  'waterhaul','williampainter','woosheyewear','dresdenvision','lensabl','glassic.co','coastal',
  // Sports
  'oakley','smithoptics','costasunglasses','mauijim','revosunglasses','spyoptic','rudyprojectna','pocsports','julbo_eyewear','bolleeyewear',
  // Independent
  'oliverpeoples','moscotnyc','gentlemonster','persol','mykitaofficial','icberlin','jacquesmarimage','cutlerandgross','bartonperreira',
  'garrettleight','saltoptics','krewe','thierrylasry','ditaeyewear','lindafarrow','retrosuperfuture','ahlemeyewear','etniabarcelona','karenwalker',
  // Streetwear
  'goodr','pitviper','knockaround','blenderseyewear','shadyrays','sunski','hawkersco',
  // Fast Fashion
  'calvinklein','ralphlauren','tommyhilfiger','boss','coach','michaelkors','lacoste','katespadeny','toryburch','marcjacobs',
  'sunglasshut','lenscrafters','specsavers','polaroid_eyewear',
  // Heritage
  'lindbergeyewear','silhouette_eyewear','matsudaeyewear',
  // Tech + Kids
  'spectacles','bose','babiators','roshambobaby',
];

interface ApifyPost {
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
  blobUrl?: string;
  videoBlobUrl?: string;
  carouselSlides?: Array<{ url: string; type: string }>;
}

async function uploadToBlob(data: ArrayBuffer, path: string, contentType: string): Promise<string | null> {
  try {
    const res = await fetch(`https://blob.vercel-storage.com/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${BLOB_TOKEN}`,
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
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 500 ? buf : null;
  } catch {
    return null;
  }
}

async function uploadPostMedia(post: ApifyPost): Promise<void> {
  const pid = String(post.id || post.shortCode || 'x');

  // Main image
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

  // Video
  if (post.videoUrl && !post.videoBlobUrl) {
    const data = await downloadMedia(post.videoUrl);
    if (data && data.byteLength < MAX_VIDEO_MB * 1024 * 1024) {
      const blobUrl = await uploadToBlob(data, `posts/video_${pid}.mp4`, 'video/mp4');
      if (blobUrl) post.videoBlobUrl = blobUrl;
    }
  }

  // Carousel slides
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

export async function GET(request: NextRequest) {
  // Auth check
  const key = request.nextUrl.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  if (key !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!APIFY_TOKEN) {
    return NextResponse.json({ error: 'APIFY_TOKEN not set' }, { status: 500 });
  }

  // Load existing post IDs
  const { ALL_POSTS } = await import('@/lib/feed');
  const existingIds = new Set(ALL_POSTS.map(p => p.id));

  const results = {
    batchesRun: 0,
    newPosts: 0,
    imagesUploaded: 0,
    videosUploaded: 0,
    slidesUploaded: 0,
    errors: [] as string[],
  };

  // Process in batches
  for (let i = 0; i < HANDLES.length; i += BATCH_SIZE) {
    const batch = HANDLES.slice(i, i + BATCH_SIZE);
    const urls = batch.map(h => `https://www.instagram.com/${h}/`);

    try {
      // Run Apify
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?waitForFinish=300`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${APIFY_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ directUrls: urls, resultsType: 'posts', resultsLimit: POSTS_PER_BRAND }),
        }
      );
      const runData = await runRes.json();
      const run = (runData as { data: { status: string; defaultDatasetId: string } }).data;

      if (run.status !== 'SUCCEEDED') {
        results.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${run.status}`);
        continue;
      }

      // Fetch posts
      const dsRes = await fetch(
        `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?limit=500`,
        { headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` } }
      );
      const posts: ApifyPost[] = await dsRes.json();

      // Process only new posts
      for (const post of posts) {
        const pid = String(post.id || '');
        if (!pid || existingIds.has(pid)) continue;
        if (!post.ownerUsername) continue;

        // Fix -1 likes
        if ((post.likesCount ?? 0) < 0) post.likesCount = 0;
        if ((post.commentsCount ?? 0) < 0) post.commentsCount = 0;

        // Upload media immediately
        await uploadPostMedia(post);

        if (post.blobUrl) results.imagesUploaded++;
        if (post.videoBlobUrl) results.videosUploaded++;
        results.slidesUploaded += (post.carouselSlides?.length || 0);

        existingIds.add(pid);
        results.newPosts++;
      }

      results.batchesRun++;
    } catch (err) {
      results.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // Note: In production, you'd write results to a database.
  // For now, the new posts are uploaded to Blob but not persisted to the JSON file
  // (since serverless functions can't write to the repo).
  // A separate script or GitHub Action would update scraped-feed.json.

  return NextResponse.json({
    success: true,
    ...results,
    message: `Rescrape complete. ${results.newPosts} new posts found, media uploaded to Blob.`,
  });
}
