# Lenzy — Integrations & Cost Estimates

Every external service Lenzy uses or should use, with monthly cost ranges based on expected usage at 5,000 brands · 250k products · 1k+ daily user actions.

## Currently using

| Service | Purpose | Plan needed | Monthly cost |
|---|---|---|---|
| **Apify** | IG / TikTok / LinkedIn / Shopify scraping | Team plan | **$199** |
| **Google Gemini** | Vision (eyewear detection) + text (digests, briefs, frame extraction) | Pay-as-you-go | **$50–150** |
| **Replicate** | FLUX Kontext + Schnell for reimagine | Pay per generation, ~$0.003/image | **$30–100** |
| **Vercel** | Hosting, Edge functions, Cron, Blob | Pro | **$20** |
| **Vercel Blob** | Image storage (scraped + reimagined) | included usage + $20 if exceeded | **$0–40** |
| **Supabase** | Postgres, Auth, Storage | Pro (8GB DB, daily backups, point-in-time recovery) | **$25** |
| **Brave Search API** | Web / news / image search | Free 2k/mo OR Data for AI plan | **$0–9** |
| | | **Subtotal current** | **$324–543** |

## To add for production grade

| Service | Purpose | Plan | Monthly cost |
|---|---|---|---|
| **OpenAI / Cohere embeddings** | pgvector similarity search across products + people | text-embedding-3-small @ $0.02 / 1M tokens | **$10–30** |
| **Sentry** | Error monitoring (UI + API) | Team plan | **$26** |
| **PostHog** | Usage analytics + session replay | Free tier sufficient initially | **$0–50** |
| **Upstash QStash** | Cron retry, DLQ, rate limiting | Pro | **$10** |
| **Upstash Redis** | API rate limiting + cache layer | Pay-per-request | **$10** |
| **Resend** | Daily digest emails + alerts | Free 3k/mo, then $20 for 50k | **$0–20** |
| **Cloudflare R2** | Backup storage for Blob exports | $0.015/GB | **$5** |
| | | **Subtotal new** | **$61–151** |

## Optional but high-value

| Service | Purpose | Cost | Priority |
|---|---|---|---|
| **Crunchbase API** | Funding history, employee count, founding dates | $49+ Starter, $1,290 Enterprise | **HIGH** — most accurate company data |
| **SimilarWeb API** | Monthly traffic per brand website | $199 Basic | **HIGH** — replaces vague "monthly_traffic" text |
| **Hunter.io** | Email enrichment for people directory | $49 Starter | **MED** — for outreach workflow |
| **Apollo.io** | LinkedIn-quality people data + emails | $59 Basic | **MED** — alternative to Hunter |
| **Meta Graph API** | Ad Library access | Free with Business verification | **HIGH** — unlocks competitor ad spend visibility |
| **Bright Data / ScrapingBee** | Fallback scraping proxies for JS-heavy sites | $50–150 | **MED** — Apify covers most cases |
| **Webz.io / Pharos** | News monitoring across the web | $99+ | **MED** — for news tab |
| **OpenSearch / Algolia** | Full-text search at scale | Free tier ok initially | **LOW** — Postgres trigram works for now |
| **Cloudinary / imgproxy** | Image transformation pipeline | $0–99 | **LOW** — Vercel Image Optimization works |

## Total monthly estimate

| Tier | Cost | What it gets you |
|---|---|---|
| **Minimum viable** | **$324–543** | Current functionality, no observability, no embeddings |
| **Production grade** | **$385–694** | Add Sentry, PostHog, Upstash, embeddings, Resend |
| **Production + enrichment** | **$680–1,200** | Add Crunchbase, SimilarWeb, Meta, Hunter — full data depth |

Recommendation: start with **production grade ($400–700/month)** at Phase 1 launch, add enrichment APIs at Phase 5 when the brand detail pages need them.

## Free / public APIs already used or available

These cost nothing and should be wired into the pipeline:

- **Wikimedia Commons** — celeb photos fallback when Brave fails
- **Wikipedia REST API** — brand history, founder bios
- **OpenStreetMap Nominatim** — geocoding HQ addresses for the world map view
- **GitHub Public API** — for tech / smart-eyewear brands' product velocity
- **Reddit JSON endpoints** — eyewear subreddit (r/glasses, r/sunglasses) for trend signals
- **Pinterest Public Pin API** — when available; otherwise Apify
- **YouTube Data API v3** — free 10k units/day, enough for brand channel monitoring
- **Sitemap parsing** — every brand exposes one publicly, no API needed

## API key checklist for Vercel

Required env vars to set on Vercel before Phase 1:

```
APIFY_TOKEN                     [paid — Apify dashboard]
GEMINI_API_KEY                  [free tier ok — Google AI Studio]
REPLICATE_API_TOKEN             [paid per gen — replicate.com]
BLOB_READ_WRITE_TOKEN           [Vercel Blob — auto-provisioned]
SUPABASE_URL                    [your Supabase project URL]
SUPABASE_KEY                    [anon key]
SUPABASE_SERVICE_ROLE_KEY       [service role — server only]
BRAVE_SEARCH_KEY                [free signup — api.search.brave.com]
GOOGLE_OAUTH_CLIENT_ID          [Google Cloud Console]
GOOGLE_OAUTH_CLIENT_SECRET      [Google Cloud Console]
LENZY_ALLOWED_EMAILS            [comma-separated emails or *@lenskart.com]
CRON_SECRET                     [random 32-char string for cron auth]
SENTRY_DSN                      [Sentry project DSN]
RESEND_API_KEY                  [Resend dashboard]
UPSTASH_REDIS_REST_URL          [Upstash dashboard]
UPSTASH_REDIS_REST_TOKEN        [Upstash dashboard]
QSTASH_TOKEN                    [Upstash QStash]
OPENAI_API_KEY                  [if using OpenAI embeddings]
META_GRAPH_TOKEN                [Meta Business — for Ad Library]
CRUNCHBASE_API_KEY              [Crunchbase API access]
SIMILARWEB_API_KEY              [SimilarWeb dashboard]
HUNTER_API_KEY                  [Hunter.io dashboard]
```

## What you (the user) need to do

To proceed with Phase 1 of the rebuild:

1. **Approve the budget tier** ($400–700/mo for production grade is the recommended starting point)
2. **Sign up for accounts** on the services we don't yet have (Sentry, Upstash, Resend, OpenAI)
3. **Provide tokens** by adding them as env vars on the Vercel project
4. **Decide on the optional/enrichment APIs** — Crunchbase + SimilarWeb + Hunter are high-impact, Meta is free-but-needs-business-verification

Once budget is approved + tokens are in env, Phase 1 of the rebuild can start.
