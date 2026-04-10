import { NextRequest, NextResponse } from 'next/server';

/**
 * BuiltWith — competitor tech stack detection.
 *
 * BuiltWith's "free" endpoint at builtwith.com/{domain} returns an
 * HTML page we can scrape for the tech stack badges. Their paid
 * API is at api.builtwith.com/v21/api.json with a key.
 *
 * We default to HTML scraping so it works without a key. If
 * BUILTWITH_API_KEY is set, we use the official API for richer
 * data.
 *
 * Usage:
 *   GET /api/builtwith?domain=warbyparker.com
 */

const BW_KEY = process.env.BUILTWITH_API_KEY || '';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  let domain = (searchParams.get('domain') || '').trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\/.*$/, '');
  if (!domain) return NextResponse.json({ error: 'domain param required' }, { status: 400 });

  // Paid API path — richer data
  if (BW_KEY) {
    try {
      const url = `https://api.builtwith.com/v21/api.json?KEY=${BW_KEY}&LOOKUP=${domain}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`BuiltWith API returned ${res.status}`);
      const data = await res.json();
      const paths = data?.Results?.[0]?.Result?.Paths?.[0];
      const techs = paths?.Technologies || [];
      return NextResponse.json({
        domain,
        source: 'official',
        total: techs.length,
        technologies: techs.map((t: Record<string, unknown>) => ({
          name: t.Name,
          category: t.Tag,
          firstDetected: t.FirstDetected,
          lastDetected: t.LastDetected,
        })),
      });
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'BuiltWith API fetch failed',
      }, { status: 502 });
    }
  }

  // Free HTML scrape path — detect the obvious stuff from the homepage itself.
  // Not as complete as BuiltWith's paid API but gives the main signals
  // (Shopify, Magento, Next.js, analytics, ad pixels) directly from the
  // target's HTML + headers.
  try {
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });
    if (!res.ok) return NextResponse.json({ error: `Target site returned ${res.status}` }, { status: 502 });
    const html = await res.text();
    const headers = Object.fromEntries(res.headers.entries());

    const detected: Array<{ name: string; category: string; evidence: string }> = [];

    const checks: Array<[RegExp, string, string]> = [
      // E-commerce platforms
      [/shopify/i, 'Shopify', 'E-commerce'],
      [/magento/i, 'Magento', 'E-commerce'],
      [/woocommerce/i, 'WooCommerce', 'E-commerce'],
      [/bigcommerce/i, 'BigCommerce', 'E-commerce'],
      [/prestashop/i, 'PrestaShop', 'E-commerce'],
      [/salesforce\.com.{0,200}commerce/i, 'Salesforce Commerce', 'E-commerce'],
      // Frameworks
      [/__NEXT_DATA__|_next\/static/i, 'Next.js', 'Framework'],
      [/nuxt|_nuxt/i, 'Nuxt', 'Framework'],
      [/gatsby/i, 'Gatsby', 'Framework'],
      [/react-dom/i, 'React', 'JavaScript library'],
      [/vue\.js|vue@/i, 'Vue.js', 'JavaScript library'],
      [/svelte/i, 'Svelte', 'JavaScript library'],
      // CMS
      [/wp-content|wordpress/i, 'WordPress', 'CMS'],
      [/drupal/i, 'Drupal', 'CMS'],
      [/contentful/i, 'Contentful', 'Headless CMS'],
      [/sanity\.io/i, 'Sanity', 'Headless CMS'],
      // Analytics / pixels
      [/google-analytics\.com|googletagmanager/i, 'Google Analytics', 'Analytics'],
      [/gtag\(|gtm\.js/i, 'Google Tag Manager', 'Analytics'],
      [/segment\.(io|com)|analytics\.js/i, 'Segment', 'Analytics'],
      [/mixpanel/i, 'Mixpanel', 'Analytics'],
      [/hotjar/i, 'Hotjar', 'Analytics'],
      [/clarity\.ms/i, 'Microsoft Clarity', 'Analytics'],
      [/amplitude/i, 'Amplitude', 'Analytics'],
      // Ad platforms
      [/connect\.facebook\.net|facebook\.com\/tr/i, 'Meta Pixel', 'Ads'],
      [/static\.ads-twitter\.com/i, 'Twitter Pixel', 'Ads'],
      [/linkedin\.com\/insight/i, 'LinkedIn Insight Tag', 'Ads'],
      [/pinterest\.com\/ct/i, 'Pinterest Tag', 'Ads'],
      [/tiktok\.com\/i18n\/pixel/i, 'TikTok Pixel', 'Ads'],
      [/snap\.licdn\.com/i, 'Snap Pixel', 'Ads'],
      // Reviews
      [/yotpo/i, 'Yotpo', 'Reviews'],
      [/trustpilot/i, 'Trustpilot', 'Reviews'],
      [/judge\.me/i, 'Judge.me', 'Reviews'],
      [/okendo/i, 'Okendo', 'Reviews'],
      // Email / CRM
      [/klaviyo/i, 'Klaviyo', 'Email'],
      [/mailchimp/i, 'Mailchimp', 'Email'],
      [/omnisend/i, 'Omnisend', 'Email'],
      [/hubspot/i, 'HubSpot', 'CRM'],
      // Chat
      [/intercom/i, 'Intercom', 'Chat'],
      [/drift\.com/i, 'Drift', 'Chat'],
      [/zendesk/i, 'Zendesk', 'Chat'],
      [/tidio/i, 'Tidio', 'Chat'],
      // Payments
      [/stripe/i, 'Stripe', 'Payments'],
      [/paypal/i, 'PayPal', 'Payments'],
      [/razorpay/i, 'Razorpay', 'Payments'],
      [/klarna/i, 'Klarna', 'BNPL'],
      [/afterpay/i, 'Afterpay', 'BNPL'],
      [/affirm/i, 'Affirm', 'BNPL'],
      // Reimagine / personalization
      [/dynamic[- ]?yield/i, 'Dynamic Yield', 'Personalization'],
      [/algolia/i, 'Algolia', 'Search'],
      // Hosting from headers
    ];

    for (const [re, name, category] of checks) {
      if (re.test(html)) detected.push({ name, category, evidence: `matched /${re.source}/` });
    }

    // Header-based detections
    if (headers['server']) detected.push({ name: headers['server'], category: 'Server', evidence: 'HTTP Server header' });
    if (headers['x-powered-by']) detected.push({ name: headers['x-powered-by'], category: 'Runtime', evidence: 'X-Powered-By header' });
    if (headers['cf-ray']) detected.push({ name: 'Cloudflare', category: 'CDN', evidence: 'CF-Ray header' });
    if (headers['x-vercel-id']) detected.push({ name: 'Vercel', category: 'Hosting', evidence: 'X-Vercel-Id header' });
    if (headers['x-amz-cf-id']) detected.push({ name: 'AWS CloudFront', category: 'CDN', evidence: 'X-Amz-Cf-Id header' });
    if (headers['x-shopid'] || headers['x-shardid'] || headers['x-shopify-stage']) {
      detected.push({ name: 'Shopify', category: 'E-commerce', evidence: 'Shopify-specific header' });
    }

    // Dedupe by name
    const seen = new Set<string>();
    const unique = detected.filter(d => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    });

    // Group by category
    const byCategory: Record<string, typeof unique> = {};
    for (const d of unique) {
      if (!byCategory[d.category]) byCategory[d.category] = [];
      byCategory[d.category].push(d);
    }

    return NextResponse.json({
      domain,
      source: 'html-scrape',
      total: unique.length,
      technologies: unique,
      byCategory,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Target site fetch failed',
    }, { status: 500 });
  }
}
