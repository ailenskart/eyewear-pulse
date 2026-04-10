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
const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';
const ACTOR_ID = 'shu8hvrXbJbY3Eb9W';
const POSTS_PER_BRAND = 10;
const BATCH_SIZE = 15;
const MAX_VIDEO_MB = 20;

// All brand handles to scrape. Sorted by category. Dedupe/verify periodically.
const HANDLES: string[] = [
  // Luxury houses
  'rayban','gucci','dior','prada','chanelofficial','tomford','versace','burberry','fendi','giorgioarmani',
  'celine','balenciaga','maisonvalentino','balmain','dolcegabbana','off____white','jacquemus','bottegaveneta','loewe','givenchyofficial',
  'louisvuitton','hermes','saintlaurent','chloe','miumiu','valentino','moncler','brioni','zegna','berluti',
  // D2C — US
  'warbyparker','zennioptical','eyebuydirect','paireyewear','felixgrayglasses','eyebuydirect','glassesusa','liingoeyewear',
  'fitzframes','yesglasses','39dollarglasses','zeelool','payneglasses','revantoptics','wearesungod','vuoriclothing',
  'thinoptics','hubblecontacts','stoggles','eyebobs','mouqy','coastalcom','lensabl','pairofthieves',
  // D2C — UK / Europe
  'aceandtate','jimmyfairly','misterspex','bonlook','cubitts','bloobloom','olliequinn','finlayandco','taylormorris',
  'arlo.wolf','barnerbrand','iolla','lookoptic','lapaireglasses','polette_eyewear','sensee','visiondirect','lenstore',
  'komono','lindbergeyewear','silhouette_eyewear','mykitaofficial','icberlin','etniabarcelona','ombraz','retrosuperfuture',
  'londonmole','dresdenvision','cyxus','westwardleaning',
  // D2C — APAC / AU
  'vehla','lespecs','quay','sunniesstudios','baileynelson','oscarwylee','vooglam','zoff_eyewear','owndays_official',
  'lohoeyewear','karenwalker','valleyeyewear','pared','sodashades','chillibeans','lemoneyewear',
  // D2C — India
  'lenskart','johnjacobseyewear','vincentchase','coolwinks','eyewearlabs','cleardekho','titaneyeplus','peppe.eyewear',
  'specscart','eyemyeye','feelgoodcontacts','opium.eyewear','dailyaddict','intellilensindia','idee_eyewear','specscart',
  // D2C — Latin America
  'hawkersco','hawkersco_br','chillibeans_us','ben_frank','meller','mellerband',
  // Sports / Performance
  'oakley','smithoptics','costasunglasses','mauijim','revosunglasses','spyoptic','rudyprojectna','pocsports','julbo_eyewear','bolleeyewear',
  'tifoseye','nativeeyewear','kaenon','bajio','rheos','peppers','under_armour_eyewear','adidaseyewear','nikevision','pumaeyewear',
  'giroeyewear','goggles4u','salomonsportstyle','100percent','fox_racing','oneal_motocross','bellhelmets',
  // Independent / Heritage
  'oliverpeoples','moscotnyc','gentlemonster','persol','jacquesmarimage','cutlerandgross','bartonperreira',
  'garrettleight','saltoptics','krewe','thierrylasry','ditaeyewear','lindafarrow','retrosuperfuture','ahlemeyewear',
  'anneetvalentin','orgreen','fleye','neubau','wolfgangproksch','matsudaeyewear','masunaga','robertmarc','leisuresociety',
  'theoeyewear','wolfgang_proksch','tavat','gold_wood','vavaeyewear','movitra_spectacles','moscot','rigards','kuboraum',
  // Streetwear / Lifestyle
  'goodr','pitviper','knockaround','blenderseyewear','shadyrays','sunski','hawkersco','9five','shwood','tomahawkshades',
  'nectarsunglasses','aojo_eyewear','roshambobaby','babiators','vansstore','supreme','stussy','palaceskateboards','fearofgod',
  'rhude','heronpreston','awakeny','ambush','sacai','undefeated','sneakerpolitics','apeukeu',
  // Fast Fashion / Mass
  'calvinklein','ralphlauren','tommyhilfiger','boss','coach','michaelkors','lacoste','katespadeny','toryburch','marcjacobs',
  'hm','zara','uniqlo','asos','urbanoutfitters','fossil','swatch','polaroid_eyewear','carrera','sunglasshut','lenscrafters','specsavers',
  'forever21','mango','allsaints','reserved','pullandbear','bershka','stradivarius','zaful',
  // Tech / Smart
  'spectacles','bose','meta','raybanmeta','tcl_raynero','rokid_tech','lucydfuture','vue_smart','innoair',
  // Sustainable
  'sea2seeeyewear','dickmoby','karunworld','palaeyewear','proofeyewear','birdeyewear','zealoptics','ecoeyewear',
  'parafina','ochis_coffee','hempeyewear','waterhaul','solo_eyewear','4oceanbracelets','pelavision',
  // Kids + niche
  'jonaspauleyewear','babiators','rivetandsway','roshambobaby','kidsociety_eyewear','kidsfashion_eyewear',
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
