import { NextRequest, NextResponse } from 'next/server';

/**
 * Shopify storefront scraper.
 *
 * Every Shopify store exposes a public /products.json endpoint
 * that returns the full product catalog with variants, prices,
 * images, inventory, and creation dates. This is an undocumented
 * but stable Shopify feature — no auth required.
 *
 * About 80% of D2C eyewear brands run on Shopify (Warby Parker,
 * Zenni, Pair Eyewear, Raen, Knockaround, Goodr, Blenders, etc.).
 * This endpoint gives us live competitive intelligence: new
 * product launches, price changes, variant counts, inventory
 * patterns — all free and public.
 *
 * Usage:
 *   GET /api/shopify?store=warbyparker.com
 *   GET /api/shopify?store=goodr.com&page=1&limit=50
 */

const KNOWN_SHOPIFY_STORES = [
  // US D2C
  { handle: 'warbyparker', domain: 'warbyparker.com', name: 'Warby Parker' },
  { handle: 'pair-eyewear', domain: 'paireyewear.com', name: 'Pair Eyewear' },
  { handle: 'raen', domain: 'raen.com', name: 'Raen' },
  { handle: 'knockaround', domain: 'knockaround.com', name: 'Knockaround' },
  { handle: 'goodr', domain: 'goodr.com', name: 'Goodr' },
  { handle: 'blenders', domain: 'blenderseyewear.com', name: 'Blenders' },
  { handle: 'diff-eyewear', domain: 'diffeyewear.com', name: 'DIFF Eyewear' },
  { handle: 'krewe', domain: 'krewe.com', name: 'Krewe' },
  { handle: 'sunski', domain: 'sunski.com', name: 'Sunski' },
  { handle: 'pit-viper', domain: 'pitviper.com', name: 'Pit Viper' },
  { handle: 'felix-gray', domain: 'felixgrayglasses.com', name: 'Felix Gray' },
  { handle: 'prive-revaux', domain: 'priverevaux.com', name: 'Privé Revaux' },
  { handle: 'caddis', domain: 'caddislife.com', name: 'Caddis' },
  { handle: 'ombraz', domain: 'ombraz.com', name: 'Ombraz' },
  { handle: 'electric', domain: 'electriccalifornia.com', name: 'Electric' },
  { handle: '9five', domain: '9five.com', name: '9FIVE' },
  { handle: 'shwood', domain: 'shwoodshop.com', name: 'Shwood' },
  { handle: 'american-optical', domain: 'aoeyewear.com', name: 'American Optical' },
  { handle: 'shady-rays', domain: 'shadyrays.com', name: 'Shady Rays' },
  { handle: 'nectar', domain: 'nectarsunglasses.com', name: 'Nectar Sunglasses' },
  { handle: 'salt-optics', domain: 'saltoptics.com', name: 'SALT.' },
  { handle: 'garrett-leight', domain: 'garrettleight.com', name: 'Garrett Leight' },
  { handle: 'moscot', domain: 'moscot.com', name: 'Moscot' },
  { handle: 'eyebobs', domain: 'eyebobs.com', name: 'Eyebobs' },
  { handle: 'distil-union', domain: 'distilunion.com', name: 'Distil Union' },
  { handle: 'shinola', domain: 'shinola.com', name: 'Shinola' },
  // UK / Europe D2C
  { handle: 'cubitts', domain: 'cubitts.com', name: 'Cubitts' },
  { handle: 'finlay-co', domain: 'finlayandco.com', name: 'Finlay & Co' },
  { handle: 'ollie-quinn', domain: 'ollieandquinn.com', name: 'Ollie Quinn' },
  { handle: 'bloobloom', domain: 'bloobloom.com', name: 'Bloobloom' },
  { handle: 'taylor-morris', domain: 'taylormorriseyewear.com', name: 'Taylor Morris' },
  { handle: 'ace-tate', domain: 'aceandtate.com', name: 'Ace & Tate' },
  { handle: 'jimmy-fairly', domain: 'jimmyfairly.com', name: 'Jimmy Fairly' },
  { handle: 'izipizi', domain: 'izipizi.com', name: 'Izipizi' },
  { handle: 'komono', domain: 'komono.com', name: 'Komono' },
  { handle: 'retrosuperfuture', domain: 'retrosuperfuture.com', name: 'RETROSUPERFUTURE' },
  { handle: 'linda-farrow', domain: 'lindafarrow.com', name: 'Linda Farrow' },
  { handle: 'thierry-lasry', domain: 'thierrylasry.com', name: 'Thierry Lasry' },
  { handle: 'pala-eyewear', domain: 'palaeyewear.com', name: 'Pala Eyewear' },
  { handle: 'ahlem', domain: 'ahlemeyewear.com', name: 'Ahlem' },
  { handle: 'iolla', domain: 'iolla.com', name: 'IOLLA' },
  { handle: 'arlo-wolf', domain: 'arlowolf.com', name: 'Arlo Wolf' },
  { handle: 'waterhaul', domain: 'waterhaul.co', name: 'Waterhaul' },
  { handle: 'sea2see', domain: 'sea2see.com', name: 'Sea2See' },
  { handle: 'dick-moby', domain: 'dickmoby.com', name: 'Dick Moby' },
  { handle: 'tens', domain: 'tens.co', name: 'Tens' },
  { handle: 'dresden-vision', domain: 'dresdenvision.com', name: 'Dresden Vision' },
  // AU / NZ D2C
  { handle: 'quay-australia', domain: 'quayaustralia.com', name: 'Quay Australia' },
  { handle: 'bailey-nelson', domain: 'baileynelson.com', name: 'Bailey Nelson' },
  { handle: 'oscar-wylee', domain: 'oscarwylee.com.au', name: 'Oscar Wylee' },
  { handle: 'vehla', domain: 'vehlaeyewear.com', name: 'Vehla Eyewear' },
  { handle: 'valley-eyewear', domain: 'valleyeyewear.com', name: 'Valley Eyewear' },
  { handle: 'karen-walker', domain: 'karenwalker.com', name: 'Karen Walker' },
  { handle: 'le-specs', domain: 'lespecs.com', name: 'Le Specs' },
  { handle: 'pared', domain: 'paredeyewear.com', name: 'Pared' },
  // India D2C
  { handle: 'lenskart', domain: 'lenskart.com', name: 'Lenskart' },
  { handle: 'eyewearlabs', domain: 'eyewearlabs.com', name: 'Eyewear Labs' },
  { handle: 'cleardekho', domain: 'cleardekho.com', name: 'ClearDekho' },
  { handle: 'titan-eyeplus', domain: 'titaneyeplus.com', name: 'Titan EyePlus' },
  { handle: 'coolwinks', domain: 'coolwinks.com', name: 'Coolwinks' },
  // Asia-Pacific
  { handle: 'owndays', domain: 'owndays.com', name: 'OWNDAYS' },
  { handle: 'zoff', domain: 'zoff.co.jp', name: 'Zoff' },
  { handle: 'loho', domain: 'lohoglasses.com', name: 'LOHO' },
  // Sustainable / niche
  { handle: 'parafina', domain: 'parafina.com', name: 'Parafina' },
  { handle: 'bird-eyewear', domain: 'birdeyewear.com', name: 'Bird Eyewear' },
  { handle: 'proof-eyewear', domain: 'iwantproof.com', name: 'Proof Eyewear' },
  { handle: 'tens-eyewear', domain: 'tens.co', name: 'Tens' },
  // Sport / performance
  { handle: 'zeal-optics', domain: 'zealoptics.com', name: 'Zeal Optics' },
  { handle: 'goodr-og', domain: 'goodr.com', name: 'Goodr' },
  { handle: 'roka', domain: 'roka.com', name: 'ROKA' },
  { handle: 'ombraz-eyewear', domain: 'ombraz.com', name: 'Ombraz' },
  { handle: 'pit-viper-og', domain: 'pitviper.com', name: 'Pit Viper' },
  // Specialty
  { handle: 'j-crew', domain: 'jcrew.com', name: 'J.Crew' },
  { handle: 'bonobos', domain: 'bonobos.com', name: 'Bonobos (eyewear)' },
  { handle: 'dita', domain: 'dita.com', name: 'DITA' },
  { handle: 'vuarnet', domain: 'vuarnet.com', name: 'Vuarnet' },
  { handle: 'mykita', domain: 'mykita.com', name: 'Mykita' },
  { handle: 'persol', domain: 'persol.com', name: 'Persol' },
  { handle: 'oakley', domain: 'oakley.com', name: 'Oakley' },
  { handle: 'ray-ban', domain: 'ray-ban.com', name: 'Ray-Ban' },
  { handle: 'maui-jim', domain: 'mauijim.com', name: 'Maui Jim' },
];

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  available: boolean;
  sku?: string;
  option1?: string;
  option2?: string;
  option3?: string;
}

interface ShopifyImage {
  id: number;
  src: string;
  width: number;
  height: number;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  vendor: string;
  product_type: string;
  tags: string | string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  created_at: string;
  updated_at: string;
  published_at: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const store = searchParams.get('store');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 250);
  const listStores = searchParams.get('list') === '1';

  if (listStores) {
    return NextResponse.json({ stores: KNOWN_SHOPIFY_STORES });
  }

  if (!store) {
    return NextResponse.json({ error: 'store param required', knownStores: KNOWN_SHOPIFY_STORES }, { status: 400 });
  }

  // Normalise domain: accept "warbyparker", "warbyparker.com", "https://warbyparker.com", etc.
  let domain = store.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\/.*$/, '');
  if (!domain.includes('.')) domain = `${domain}.com`;

  try {
    const url = `https://${domain}/products.json?limit=${limit}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json({
        error: `${domain} did not return a valid Shopify products.json (HTTP ${res.status}). They may not be on Shopify.`,
        store: domain,
      }, { status: 502 });
    }

    const data = await res.json();
    const products: ShopifyProduct[] = data.products || [];

    // Compute analytics
    let totalActive = 0;
    let totalVariants = 0;
    const priceSum: number[] = [];
    const types = new Map<string, number>();
    const tags = new Map<string, number>();
    const recentlyAdded: ShopifyProduct[] = [];
    const weekAgo = Date.now() - 7 * 86400000;

    for (const p of products) {
      const hasAvailable = p.variants.some(v => v.available);
      if (hasAvailable) totalActive++;
      totalVariants += p.variants.length;
      for (const v of p.variants) {
        const price = Number(v.price || 0);
        if (price > 0) priceSum.push(price);
      }
      types.set(p.product_type || 'Unknown', (types.get(p.product_type || 'Unknown') || 0) + 1);
      const tagList = Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      for (const t of tagList) tags.set(t, (tags.get(t) || 0) + 1);
      if (p.created_at && new Date(p.created_at).getTime() > weekAgo) recentlyAdded.push(p);
    }

    const avgPrice = priceSum.length > 0 ? priceSum.reduce((a, b) => a + b, 0) / priceSum.length : 0;
    const minPrice = priceSum.length > 0 ? Math.min(...priceSum) : 0;
    const maxPrice = priceSum.length > 0 ? Math.max(...priceSum) : 0;

    // Shape product payload
    const clean = products.map(p => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      type: p.product_type,
      vendor: p.vendor,
      image: p.images?.[0]?.src || '',
      images: (p.images || []).map(i => i.src),
      price: p.variants?.[0]?.price || '0',
      comparePrice: p.variants?.[0]?.compare_at_price || null,
      available: p.variants?.some(v => v.available) || false,
      variantCount: p.variants?.length || 0,
      soldOut: !p.variants?.some(v => v.available),
      createdAt: p.created_at,
      url: `https://${domain}/products/${p.handle}`,
      tags: Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map(t => t.trim()).filter(Boolean),
    }));

    return NextResponse.json({
      store: domain,
      page,
      limit,
      products: clean,
      total: products.length,
      stats: {
        totalProducts: products.length,
        totalActive,
        totalVariants,
        avgPrice: Math.round(avgPrice * 100) / 100,
        minPrice,
        maxPrice,
        newThisWeek: recentlyAdded.length,
        topTypes: [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
        topTags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count })),
      },
      recentlyAdded: recentlyAdded.slice(0, 10).map(p => ({
        id: p.id,
        title: p.title,
        image: p.images?.[0]?.src || '',
        price: p.variants?.[0]?.price || '0',
        createdAt: p.created_at,
        url: `https://${domain}/products/${p.handle}`,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Shopify fetch failed',
      store: domain,
    }, { status: 500 });
  }
}
