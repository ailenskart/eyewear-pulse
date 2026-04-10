import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { runActor, isApifyConfigured, DEFAULT_ACTORS, apifySetupInstructions } from '@/lib/apify';

/**
 * Celebrity Instagram eyewear detector.
 *
 * Flow:
 *   1. Resolve the celeb's Instagram handle (known map or user override)
 *   2. Call Apify apify/instagram-scraper to fetch their latest N posts
 *   3. Download each post's image in parallel
 *   4. Send all images to Gemini Vision in ONE batched call — returns
 *      a JSON array flagging which posts have eyewear + frame description
 *   5. Filter to only eyewear posts and return them with metadata
 *
 * Cached in-memory for 3 days per celeb so repeat clicks are free.
 *
 *   GET /api/celebrities/instagram?name=Rihanna
 *   GET /api/celebrities/instagram?name=Virat+Kohli&handle=virat.kohli&limit=20
 *   GET /api/celebrities/instagram?name=X&refresh=1
 */

export const maxDuration = 60;

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');

// Verified Instagram handles for popular celebs. Extend freely.
const KNOWN_HANDLES: Record<string, string> = {
  // Music
  'Rihanna': 'badgalriri',
  'Beyoncé': 'beyonce',
  'Taylor Swift': 'taylorswift',
  'Selena Gomez': 'selenagomez',
  'Ariana Grande': 'arianagrande',
  'Billie Eilish': 'billieeilish',
  'The Weeknd': 'theweeknd',
  'Drake': 'champagnepapi',
  'Travis Scott': 'travisscott',
  'Snoop Dogg': 'snoopdogg',
  'Post Malone': 'postmalone',
  'Bad Bunny': 'badbunnypr',
  'Dua Lipa': 'dualipa',
  'Elton John': 'eltonjohn',
  'Harry Styles': 'harrystyles',
  'Pharrell Williams': 'pharrell',
  'Lady Gaga': 'ladygaga',
  'Madonna': 'madonna',
  'Ed Sheeran': 'teddysphotos',
  'Adele': 'adele',
  'Miley Cyrus': 'mileycyrus',
  'Shawn Mendes': 'shawnmendes',
  'Camila Cabello': 'camila_cabello',
  'Sabrina Carpenter': 'sabrinacarpenter',
  'Olivia Rodrigo': 'olivia.rodrigo',
  'Doja Cat': 'dojacat',
  'Halsey': 'iamhalsey',
  'Lana Del Rey': 'honeymoon',
  'Lewis Capaldi': 'lewiscapaldi',
  'Sam Smith': 'samsmith',
  'Rosalía': 'rosalia.vt',
  'J Balvin': 'jbalvin',
  'Tyler, The Creator': 'feliciathegoat',
  'A$AP Rocky': 'asaprocky',
  'Frank Ocean': 'blonded',
  'Lil Nas X': 'lilnasx',
  'Burna Boy': 'burnaboygram',
  'Wizkid': 'wizkidayo',
  'Davido': 'davido',
  'Jennifer Lopez': 'jlo',
  'Kanye West': 'kanyewest',
  'Jay-Z': 'jayzmusic',
  // Actors
  'Tom Cruise': 'tomcruise',
  'Leonardo DiCaprio': 'leonardodicaprio',
  'Johnny Depp': 'johnnydepp',
  'Brad Pitt': 'bradpittofflcial',
  'Robert Downey Jr': 'robertdowneyjr',
  'Will Smith': 'willsmith',
  'Ryan Gosling': 'ryangoslingofficiai',
  'Ryan Reynolds': 'vancityreynolds',
  'Dwayne Johnson': 'therock',
  'Chris Hemsworth': 'chrishemsworth',
  'Idris Elba': 'idriselba',
  'Michael B Jordan': 'michaelbjordan',
  'Pedro Pascal': 'pascalispunk',
  'Henry Cavill': 'henrycavill',
  'Jason Statham': 'jasonstatham',
  'Daniel Craig': 'danielcraig',
  'Jamie Foxx': 'iamjamiefoxx',
  'Denzel Washington': 'denzelwashington',
  'Samuel L Jackson': 'samuelljackson',
  'Timothée Chalamet': 'tchalamet',
  'Zendaya': 'zendaya',
  // Indian stars
  'Shah Rukh Khan': 'iamsrk',
  'Amitabh Bachchan': 'amitabhbachchan',
  'Aamir Khan': 'aamir_khan',
  'Salman Khan': 'beingsalmankhan',
  'Ranveer Singh': 'ranveersingh',
  'Hrithik Roshan': 'hrithikroshan',
  'Vicky Kaushal': 'vickykaushal09',
  'Ayushmann Khurrana': 'ayushmannk',
  'Kartik Aaryan': 'kartikaaryan',
  'Sidharth Malhotra': 'sidmalhotra',
  'Tiger Shroff': 'tigerjackieshroff',
  'Deepika Padukone': 'deepikapadukone',
  'Priyanka Chopra': 'priyankachopra',
  'Alia Bhatt': 'aliaabhatt',
  'Katrina Kaif': 'katrinakaif',
  'Anushka Sharma': 'anushkasharma',
  'Kareena Kapoor': 'kareenakapoorkhan',
  'Kiara Advani': 'kiaraaliaadvani',
  'Sara Ali Khan': 'saraalikhan95',
  'Janhvi Kapoor': 'janhvikapoor',
  'Ananya Panday': 'ananyapanday',
  'Suhana Khan': 'suhanakhan2',
  // Athletes
  'Virat Kohli': 'virat.kohli',
  'MS Dhoni': 'mahi7781',
  'Rohit Sharma': 'rohitsharma45',
  'Hardik Pandya': 'hardikpandya93',
  'Cristiano Ronaldo': 'cristiano',
  'Lionel Messi': 'leomessi',
  'Neymar Jr': 'neymarjr',
  'Kylian Mbappé': 'k.mbappe',
  'Erling Haaland': 'erling.haaland',
  'David Beckham': 'davidbeckham',
  'LeBron James': 'kingjames',
  'Stephen Curry': 'stephencurry30',
  'Serena Williams': 'serenawilliams',
  'Roger Federer': 'rogerfederer',
  'Rafael Nadal': 'rafaelnadal',
  'Novak Djokovic': 'djokernole',
  'Lewis Hamilton': 'lewishamilton',
  'Conor McGregor': 'thenotoriousmma',
  // Models / celebrities
  'Kim Kardashian': 'kimkardashian',
  'Kylie Jenner': 'kyliejenner',
  'Kendall Jenner': 'kendalljenner',
  'Hailey Bieber': 'haileybieber',
  'Bella Hadid': 'bellahadid',
  'Gigi Hadid': 'gigihadid',
  'Cara Delevingne': 'caradelevingne',
  'Naomi Campbell': 'naomi',
  'Kate Moss': 'katemossagency',
  'Chiara Ferragni': 'chiaraferragni',
  'Victoria Beckham': 'victoriabeckham',
  'Emma Chamberlain': 'emmachamberlain',
  'Mr. Beast': 'mrbeast',
  // Tech
  'Mark Zuckerberg': 'zuck',
  'Jeff Bezos': 'jeffbezos',
  'Sundar Pichai': 'sundarpichai',
  'Satya Nadella': 'satyanadella',
  // Royalty / other
  'Meghan Markle': 'meghan',
};

interface InstagramPost {
  id: string;
  shortCode?: string;
  caption?: string;
  displayUrl: string;
  videoUrl?: string;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
  url?: string;
  type?: string;
}

interface EyewearPost {
  id: string;
  imageUrl: string;
  postUrl: string;
  caption: string;
  likes: number;
  comments: number;
  postedAt: string;
  eyewearType: string;
}

interface CelebIgResult {
  name: string;
  handle: string;
  totalPostsScanned: number;
  eyewearPostsCount: number;
  eyewearPosts: EyewearPost[];
  fetchedAt: string;
  cached: boolean;
}

const CACHE = new Map<string, { payload: CelebIgResult; expiresAt: number }>();
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days

function resolveHandle(name: string, override?: string | null): string | null {
  if (override) return override.replace(/^@/, '').trim();
  const direct = KNOWN_HANDLES[name];
  if (direct) return direct;
  // Try case-insensitive match
  const lowerMap = new Map(Object.entries(KNOWN_HANDLES).map(([k, v]) => [k.toLowerCase(), v]));
  return lowerMap.get(name.toLowerCase()) || null;
}

/**
 * Batched eyewear detection. Send all images in one Gemini Vision
 * call which returns a compact JSON array of yes/no + frame type.
 */
async function detectEyewearBatch(
  posts: Array<{ id: string; imageUrl: string; caption: string }>,
): Promise<Map<string, string>> {
  const detected = new Map<string, string>();
  if (posts.length === 0) return detected;

  // Download all images in parallel
  const loaded = await Promise.all(posts.map(async p => {
    try {
      const res = await fetch(p.imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 5 * 1024 * 1024) return null; // skip images over 5MB
      const base64 = Buffer.from(buf).toString('base64');
      const mime = res.headers.get('content-type') || 'image/jpeg';
      return { ...p, base64, mime };
    } catch { return null; }
  }));
  const valid = loaded.filter((x): x is NonNullable<typeof x> => x !== null);
  if (valid.length === 0) return detected;

  // Send in batches of 8 to Gemini Vision (keeps each request under context limits)
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const BATCH = 8;
  for (let start = 0; start < valid.length; start += BATCH) {
    const slice = valid.slice(start, start + BATCH);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      {
        text: `I'm showing you ${slice.length} photos in order. For EACH photo, tell me whether the MAIN PERSON is visibly wearing sunglasses or eyeglasses ON THEIR FACE. Return a compact JSON array, one entry per image in the same order:

[{"i":0,"yes":true,"type":"aviator sunglasses, gold metal frame"},{"i":1,"yes":false},{"i":2,"yes":true,"type":"round tortoise eyeglasses"}]

Strict rules:
- yes=true ONLY if eyewear is clearly visible ON the person's face.
- Eyewear held in hand, hanging from pocket, sitting on head, or on other people does NOT count.
- Group photos: only mark yes if the primary subject (usually the celebrity, usually largest in frame) has eyewear on.
- "type" is required ONLY when yes=true. Describe: shape (aviator/round/square/wayfarer/cat-eye/rectangular/oversized) + color + material when visible. Max 60 chars.
- Output ONLY the raw JSON array. No preamble, no code fences, no commentary.`,
      },
      ...slice.map(v => ({ inlineData: { mimeType: v.mime, data: v.base64 } })),
    ];

    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const r = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
        });
        if (!r.text) continue;
        const txt = r.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
        const arr = JSON.parse(txt) as Array<{ i: number; yes: boolean; type?: string }>;
        for (const item of arr) {
          if (item.yes && slice[item.i]) {
            detected.set(slice[item.i].id, item.type || 'eyewear');
          }
        }
        break;
      } catch { continue; }
    }
  }
  return detected;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const name = (searchParams.get('name') || '').trim();
  const handleOverride = searchParams.get('handle');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 40);
  const refresh = searchParams.get('refresh') === '1';

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  if (!isApifyConfigured()) {
    return NextResponse.json({
      needsSetup: true,
      name,
      setupInstructions: {
        ...apifySetupInstructions(),
        why: 'Scraping celeb Instagrams needs Apify. Each click costs ~$0.01 in credits.',
      },
    });
  }

  const handle = resolveHandle(name, handleOverride);
  if (!handle) {
    return NextResponse.json({
      error: `No Instagram handle configured for "${name}". Pass &handle=theirusername to override.`,
      name,
      needsHandle: true,
    });
  }

  const cacheKey = `${handle.toLowerCase()}:${limit}`;
  const now = Date.now();
  if (!refresh) {
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ ...cached.payload, cached: true });
    }
  }

  // 1. Fetch IG posts via Apify
  const apifyInput = {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    addParentData: false,
    onlyPostsNewerThan: '2 years',
  };

  const result = await runActor<InstagramPost>(DEFAULT_ACTORS.instagram, apifyInput, {
    timeout: 50,
    maxItems: limit,
  });

  if (!result.ok) {
    return NextResponse.json({
      error: result.error,
      name,
      handle,
      hint: `Profile @${handle} may be private, blocked, or the handle is wrong.`,
    }, { status: 502 });
  }

  const posts = result.items.filter(p => p.displayUrl);
  if (posts.length === 0) {
    return NextResponse.json({
      name,
      handle,
      totalPostsScanned: 0,
      eyewearPostsCount: 0,
      eyewearPosts: [],
      fetchedAt: new Date().toISOString(),
      cached: false,
      hint: 'No posts returned — profile may be private or empty.',
    });
  }

  // 2. Detect eyewear with Gemini Vision
  const detectionInput = posts.map(p => ({
    id: p.id || p.shortCode || String(Math.random()),
    imageUrl: p.displayUrl,
    caption: p.caption?.substring(0, 200) || '',
  }));
  const detected = await detectEyewearBatch(detectionInput);

  // 3. Build output with only eyewear posts
  const eyewearPosts: EyewearPost[] = posts
    .filter(p => {
      const id = p.id || p.shortCode || '';
      return detected.has(id);
    })
    .map(p => {
      const id = p.id || p.shortCode || '';
      return {
        id,
        imageUrl: p.displayUrl,
        postUrl: p.url || `https://www.instagram.com/p/${p.shortCode}/`,
        caption: p.caption?.substring(0, 300) || '',
        likes: p.likesCount || 0,
        comments: p.commentsCount || 0,
        postedAt: p.timestamp || '',
        eyewearType: detected.get(id) || 'eyewear',
      };
    })
    .sort((a, b) => b.likes - a.likes);

  const payload: CelebIgResult = {
    name,
    handle,
    totalPostsScanned: posts.length,
    eyewearPostsCount: eyewearPosts.length,
    eyewearPosts,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };

  CACHE.set(cacheKey, { payload, expiresAt: now + CACHE_TTL });
  return NextResponse.json(payload);
}
