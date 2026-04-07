/**
 * Apify Instagram Scraper — batch scrape all real eyewear brand accounts
 *
 * Usage: npx tsx scripts/scrape-brands.ts
 *
 * Scrapes 5 recent posts per brand from 80+ real eyewear Instagram accounts
 * using the Apify Instagram Scraper actor, then saves to src/data/scraped-feed.json
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.error('Error: APIFY_TOKEN environment variable is required');
  console.error('Usage: APIFY_TOKEN=your_token npx tsx scripts/scrape-brands.ts');
  process.exit(1);
}
const ACTOR_ID = 'shu8hvrXbJbY3Eb9W';
const POSTS_PER_BRAND = 5;
const BATCH_SIZE = 10; // URLs per Apify run
const WAIT_TIMEOUT = 300; // seconds to wait for each run

// Real Instagram handles mapped to brand info
const BRANDS: Array<{ handle: string; name: string; category: string; region: string; priceRange: string }> = [
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
  { handle: 'celine', name: 'Celine', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'balenciaga', name: 'Balenciaga', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'maisonvalentino', name: 'Valentino', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'balmain', name: 'Balmain', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'dolcegabbana', name: 'Dolce & Gabbana', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'off____white', name: 'Off-White', category: 'Luxury', region: 'Europe', priceRange: '$$$' },
  { handle: 'jacquemus', name: 'Jacquemus', category: 'Luxury', region: 'Europe', priceRange: '$$$' },
  { handle: 'bottegaveneta', name: 'Bottega Veneta', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'loewe', name: 'Loewe', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },
  { handle: 'givenchyofficial', name: 'Givenchy', category: 'Luxury', region: 'Europe', priceRange: '$$$$' },

  // D2C
  { handle: 'warbyparker', name: 'Warby Parker', category: 'D2C', region: 'North America', priceRange: '$$' },
  { handle: 'zennioptical', name: 'Zenni', category: 'D2C', region: 'North America', priceRange: '$' },
  { handle: 'eyebuydirect', name: 'EyeBuyDirect', category: 'D2C', region: 'North America', priceRange: '$' },
  { handle: 'aceandtate', name: 'Ace & Tate', category: 'D2C', region: 'Europe', priceRange: '$$' },
  { handle: 'sunniesstudios', name: 'Sunnies Studios', category: 'D2C', region: 'Southeast Asia', priceRange: '$' },
  { handle: 'diffeyewear', name: 'Diff Eyewear', category: 'D2C', region: 'North America', priceRange: '$$' },
  { handle: 'quayaustralia', name: 'Quay Australia', category: 'D2C', region: 'Oceania', priceRange: '$$' },
  { handle: 'lespecs', name: 'Le Specs', category: 'D2C', region: 'Oceania', priceRange: '$$' },
  { handle: 'bonlook', name: 'BonLook', category: 'D2C', region: 'North America', priceRange: '$$' },
  { handle: 'clearlyca', name: 'Clearly', category: 'D2C', region: 'North America', priceRange: '$' },
  { handle: 'felixgrayglasses', name: 'Felix Gray', category: 'D2C', region: 'North America', priceRange: '$$' },
  { handle: 'izipizi', name: 'Izipizi', category: 'D2C', region: 'Europe', priceRange: '$$' },
  { handle: 'cubitts', name: 'Cubitts', category: 'D2C', region: 'Europe', priceRange: '$$' },

  // Sports
  { handle: 'oakley', name: 'Oakley', category: 'Sports', region: 'North America', priceRange: '$$' },
  { handle: 'smithoptics', name: 'Smith Optics', category: 'Sports', region: 'North America', priceRange: '$$' },
  { handle: 'costasunglasses', name: 'Costa', category: 'Sports', region: 'North America', priceRange: '$$' },
  { handle: 'mauijim', name: 'Maui Jim', category: 'Sports', region: 'North America', priceRange: '$$$' },
  { handle: 'revosunglasses', name: 'Revo', category: 'Sports', region: 'North America', priceRange: '$$' },
  { handle: 'spyoptic', name: 'Spy Optic', category: 'Sports', region: 'North America', priceRange: '$$' },
  { handle: 'rudyprojectna', name: 'Rudy Project', category: 'Sports', region: 'Europe', priceRange: '$$' },
  { handle: 'pocsports', name: 'POC Sports', category: 'Sports', region: 'Europe', priceRange: '$$$' },
  { handle: 'julbo_eyewear', name: 'Julbo', category: 'Sports', region: 'Europe', priceRange: '$$' },
  { handle: 'bolleeyewear', name: 'Bolle', category: 'Sports', region: 'Europe', priceRange: '$$' },

  // Independent / Designer
  { handle: 'oliverpeoples', name: 'Oliver Peoples', category: 'Independent', region: 'North America', priceRange: '$$$' },
  { handle: 'moscotnyc', name: 'MOSCOT', category: 'Independent', region: 'North America', priceRange: '$$$' },
  { handle: 'gentlemonster', name: 'Gentle Monster', category: 'Independent', region: 'East Asia', priceRange: '$$$' },
  { handle: 'persol', name: 'Persol', category: 'Heritage', region: 'Europe', priceRange: '$$$' },
  { handle: 'mykitaofficial', name: 'Mykita', category: 'Independent', region: 'Europe', priceRange: '$$$' },
  { handle: 'icberlin', name: 'IC! Berlin', category: 'Independent', region: 'Europe', priceRange: '$$$' },
  { handle: 'jacquesmarimage', name: 'Jacques Marie Mage', category: 'Independent', region: 'North America', priceRange: '$$$$' },
  { handle: 'cutlerandgross', name: 'Cutler and Gross', category: 'Independent', region: 'Europe', priceRange: '$$$' },
  { handle: 'bartonperreira', name: 'Barton Perreira', category: 'Independent', region: 'North America', priceRange: '$$$' },
  { handle: 'garrettleight', name: 'Garrett Leight', category: 'Independent', region: 'North America', priceRange: '$$$' },
  { handle: 'saltoptics', name: 'Salt Optics', category: 'Independent', region: 'North America', priceRange: '$$$' },
  { handle: 'krewe', name: 'Krewe', category: 'Independent', region: 'North America', priceRange: '$$$' },
  { handle: 'thierrylasry', name: 'Thierry Lasry', category: 'Independent', region: 'Europe', priceRange: '$$$' },
  { handle: 'ditaeyewear', name: 'DITA', category: 'Independent', region: 'North America', priceRange: '$$$$' },
  { handle: 'lindafarrow', name: 'Linda Farrow', category: 'Independent', region: 'Europe', priceRange: '$$$$' },
  { handle: 'retrosuperfuture', name: 'RETROSUPERFUTURE', category: 'Independent', region: 'Europe', priceRange: '$$$' },
  { handle: 'ahlemeyewear', name: 'Ahlem', category: 'Independent', region: 'Europe', priceRange: '$$$' },
  { handle: 'etniabarcelona', name: 'Etnia Barcelona', category: 'Independent', region: 'Europe', priceRange: '$$' },
  { handle: 'karenwalker', name: 'Karen Walker', category: 'Independent', region: 'Oceania', priceRange: '$$$' },

  // Streetwear
  { handle: 'goodr', name: 'Goodr', category: 'Streetwear', region: 'North America', priceRange: '$' },
  { handle: 'pitviper', name: 'Pit Viper', category: 'Streetwear', region: 'North America', priceRange: '$' },
  { handle: 'knockaround', name: 'Knockaround', category: 'Streetwear', region: 'North America', priceRange: '$' },
  { handle: 'blenderseyewear', name: 'Blenders', category: 'Streetwear', region: 'North America', priceRange: '$' },
  { handle: 'shadyrays', name: 'Shady Rays', category: 'Streetwear', region: 'North America', priceRange: '$' },
  { handle: 'sunski', name: 'Sunski', category: 'Streetwear', region: 'North America', priceRange: '$' },
  { handle: 'hawkersco', name: 'Hawkers', category: 'Streetwear', region: 'Europe', priceRange: '$' },

  // Fast Fashion
  { handle: 'calvinklein', name: 'Calvin Klein', category: 'Fast Fashion', region: 'North America', priceRange: '$$' },
  { handle: 'ralphlauren', name: 'Ralph Lauren', category: 'Fast Fashion', region: 'North America', priceRange: '$$$' },
  { handle: 'tommyhilfiger', name: 'Tommy Hilfiger', category: 'Fast Fashion', region: 'North America', priceRange: '$$' },
  { handle: 'boss', name: 'Hugo Boss', category: 'Fast Fashion', region: 'Europe', priceRange: '$$$' },
  { handle: 'coach', name: 'Coach', category: 'Fast Fashion', region: 'North America', priceRange: '$$' },
  { handle: 'michaelkors', name: 'Michael Kors', category: 'Fast Fashion', region: 'North America', priceRange: '$$' },
  { handle: 'lacoste', name: 'Lacoste', category: 'Fast Fashion', region: 'Europe', priceRange: '$$' },
  { handle: 'katespadeny', name: 'Kate Spade', category: 'Fast Fashion', region: 'North America', priceRange: '$$' },
  { handle: 'toryburch', name: 'Tory Burch', category: 'Fast Fashion', region: 'North America', priceRange: '$$$' },
  { handle: 'marcjacobs', name: 'Marc Jacobs', category: 'Fast Fashion', region: 'North America', priceRange: '$$$' },

  // Heritage / Optical
  { handle: 'lindbergeyewear', name: 'Lindberg', category: 'Heritage', region: 'Europe', priceRange: '$$$$' },
  { handle: 'silhouette_eyewear', name: 'Silhouette', category: 'Heritage', region: 'Europe', priceRange: '$$$' },
  { handle: 'matsudaeyewear', name: 'Matsuda', category: 'Heritage', region: 'East Asia', priceRange: '$$$$' },

  // Retail
  { handle: 'sunglasshut', name: 'Sunglass Hut', category: 'Fast Fashion', region: 'North America', priceRange: '$$' },
  { handle: 'lenscrafters', name: 'LensCrafters', category: 'Fast Fashion', region: 'North America', priceRange: '$$' },
  { handle: 'specsavers', name: 'Specsavers', category: 'Fast Fashion', region: 'Europe', priceRange: '$' },

  // Tech
  { handle: 'spectacles', name: 'Snap Spectacles', category: 'Tech', region: 'North America', priceRange: '$$$' },
  { handle: 'bose', name: 'Bose Frames', category: 'Tech', region: 'North America', priceRange: '$$$' },

  // Kids
  { handle: 'babiators', name: 'Babiators', category: 'Kids', region: 'North America', priceRange: '$' },
  { handle: 'roshambobaby', name: 'Roshambo Baby', category: 'Kids', region: 'North America', priceRange: '$' },
];

interface ScrapedPost {
  id: string;
  type: string;
  shortCode: string;
  caption: string;
  url: string;
  commentsCount: number;
  likesCount: number;
  displayUrl: string;
  images: string[];
  timestamp: string;
  ownerUsername: string;
  ownerFullName: string;
  hashtags: string[];
  mentions: string[];
  dimensionsWidth: number;
  dimensionsHeight: number;
  videoUrl?: string;
  brand: {
    handle: string;
    name: string;
    category: string;
    region: string;
    priceRange: string;
  };
}

async function runApifyBatch(urls: string[]): Promise<string> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?waitForFinish=${WAIT_TIMEOUT}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIFY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        directUrls: urls,
        resultsType: 'posts',
        resultsLimit: POSTS_PER_BRAND,
      }),
    }
  );
  const data = await res.json();
  const run = data.data;
  console.log(`  Run ${run.id}: ${run.status} | ${run.chargedEventCounts?.result || 0} results`);
  return run.defaultDatasetId;
}

async function fetchDataset(datasetId: string): Promise<ScrapedPost[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?limit=1000`,
    { headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` } }
  );
  return res.json();
}

async function main() {
  console.log(`Scraping ${BRANDS.length} brands, ${POSTS_PER_BRAND} posts each...`);
  console.log(`Batch size: ${BATCH_SIZE} brands per Apify run`);
  console.log(`Estimated cost: ~$${(BRANDS.length * POSTS_PER_BRAND * 0.0027).toFixed(2)}\n`);

  const allPosts: ScrapedPost[] = [];
  const brandMap = new Map(BRANDS.map(b => [b.handle, b]));

  for (let i = 0; i < BRANDS.length; i += BATCH_SIZE) {
    const batch = BRANDS.slice(i, i + BATCH_SIZE);
    const urls = batch.map(b => `https://www.instagram.com/${b.handle}/`);

    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(BRANDS.length / BATCH_SIZE)}: ${batch.map(b => b.handle).join(', ')}`);

    try {
      const datasetId = await runApifyBatch(urls);
      const posts = await fetchDataset(datasetId);

      // Attach brand info to each post
      for (const post of posts) {
        const handle = post.ownerUsername;
        const brand = brandMap.get(handle);
        if (brand) {
          post.brand = brand;
        } else {
          // Try to match by checking if any brand handle is in the post owner
          const matched = BRANDS.find(b => b.handle === handle || handle.includes(b.handle));
          post.brand = matched || { handle, name: post.ownerFullName || handle, category: 'Independent', region: 'North America', priceRange: '$$' };
        }
        allPosts.push(post);
      }

      console.log(`  Got ${posts.length} posts from this batch`);
    } catch (err) {
      console.error(`  ERROR in batch:`, err instanceof Error ? err.message : err);
    }

    // Small delay between batches
    if (i + BATCH_SIZE < BRANDS.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\n========================================`);
  console.log(`Total posts scraped: ${allPosts.length}`);
  console.log(`Brands with data: ${new Set(allPosts.map(p => p.ownerUsername)).size}`);

  // Save to file
  const fs = await import('fs');
  const path = await import('path');
  const outDir = path.join(process.cwd(), 'src', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'scraped-feed.json');
  fs.writeFileSync(outPath, JSON.stringify(allPosts, null, 2));
  console.log(`\nSaved to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
}

main().catch(console.error);
