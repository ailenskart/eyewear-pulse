# Lenzy — Module Specification

Lenzy is organized into **10 modules**. Each is a standalone capability with its own data, UI, and team workflow. Together they form one system.

---

## Module 1 · Brand Ecosystem

**The job:** know every player in the global eyewear industry — who they are, who owns them, where they sit, who runs them, what they sell.

**Today:** 3,500+ brands in `tracked_brands`. 63 columns per brand including handle, name, country, ISO, region, HQ city, founded year, business type, business model, distribution channel, D2C/manufacturer/retailer/luxury/independent/smart-eyewear flags, sustainability focus, parent company, ownership type, public/ticker, employee count, store count, revenue estimate, monthly traffic, CEO name, NAICS/SIC codes, website, all socials, IG followers, sitemap stats, completeness %, confidence %, tags.

**Tomorrow:**
- **Per-brand deep-dive page** at `/brands/[id]` (the missing piece)
- Brand relationship graph — parent → subsidiary, competitors, collabs, licensing
- Side-by-side comparison view (3 brands at a time)
- Brand timeline — every post, product launch, person move, news mention merged chronologically
- Auto-enrichment — Crunchbase + SimilarWeb + LinkedIn cron pulling fresh data weekly
- Brand alerts — "Warby just opened a store in Mumbai" via Resend email

---

## Module 2 · Product Intelligence

**The job:** every SKU sold by every eyewear brand worldwide, with price history, attributes, similarity search.

**Today:** 52,451 products in `brand_content` (type=`product`). Half from a Shopify scraper, half from the user's xlsx import. Linked to brands via `brand_id`.

**Tomorrow:**
- **Sitemap parser** — 8,961 sitemap URLs in our data, only 31k product URLs extracted. Re-parse to hit 250k+ products.
- **Price history** — `price_history` table exists but empty. Snapshot daily, alert on changes.
- **Product similarity search** — pgvector embeddings on product names + descriptions + images. "Find frames like this Ray-Ban Wayfarer across all brands."
- **New launches feed** — global timeline of "what dropped this week" filterable by category/region/price.
- **Frame attribute extraction** — Gemini Vision on every product image → structured `{shape, color, material, lens_type, style}` written to `brand_content.data`.

---

## Module 3 · People Intelligence

**The job:** every CEO, founder, designer, supply chain lead, marketing head in the eyewear industry. Who's where, who they used to work for, who's hiring.

**Today:** 1,612 people in `directory_people`. Linked to brands via `brand_ids[]`. From three sources: 41 manually seeded A-listers, 1,571 from xlsx import, scaffolded LinkedIn scraper not yet running at scale.

**Tomorrow:**
- **LinkedIn live sync** — weekly Apify cron to refresh existing profiles, detect title changes
- **"Recently moved" feed** — anyone whose `company_current` changed in the last 30 days
- **Hiring intelligence** — surface available talent by filter (e.g., "Senior product designers who left Warby in last 90 days")
- **Outreach workflow** — mark people as "approached / talking / hired / passed", track touch history
- **Auto-enrich** new uploads via Hunter.io email + Crunchbase profile pull
- **Org charts** — for top 50 brands, visualize the leadership team
- **Notify** when a tracked person posts on LinkedIn (via Apify polling)

---

## Module 4 · Creative Intelligence

**The job:** see every piece of creative content (Instagram, TikTok, YouTube, ads) from every brand, in one feed.

**Today:** 2,045 IG posts in `brand_content` from 310 brands via Apify. Ad library partially scaffolded but no Meta token. Reimagine generates new creative.

**Tomorrow:**
- **Scale IG to all 3,500 brands** — currently only 30 in fast tier. Move to all-active brands on a 24-hour rotation.
- **Meta Ad Library** integration with Graph API token — see what paid creative competitors run
- **TikTok Creative Center** scraper for trending eyewear ads
- **YouTube channel scraper** for brand video content
- **Pinterest scraper** for inspiration board mining
- **AI creative briefs per brand** — Gemini summarizes what each brand's creative POV is
- **Trend stream** — top 50 posts globally per day, ranked by engagement velocity
- **Save-to-Board** flow — one-click add any post to a private/shared board

---

## Module 5 · Celebrity & Influencer Layer

**The job:** know who is wearing what eyewear, branded OR not. The most defensible moat.

**Today:** 12 celeb_photo rows. 160 celeb catalog. Vision pipeline works on a per-celeb scan. Cron set up but not running at scale.

**Tomorrow:**
- **Auto-scan top 500 celebs** weekly. Each scan: Apify their IG → Gemini Vision filters for face-eyewear → upload to Blob → log to `brand_content` (type=celeb_photo).
- **Micro-influencer discovery** — scrape eyewear hashtags (#sunglasses, #specsstyle, #eyewearfashion) → Vision filter → surface accounts with 5k-50k followers wearing eyewear repeatedly. These are the next celebrities.
- **Cross-attribute to brands** — when Vision detects "round gold metal" + matching product in our catalog, attribute the photo to that brand with confidence score
- **Celeb timeline per brand** — "All celebs spotted wearing Ray-Ban this quarter"
- **Reverse search** — "Who's wearing tortoise cat-eye sunglasses this month?" → gallery of celebs + influencers
- **Editorial content** — "Top 20 celebrities wearing Lenskart frames in Bollywood" auto-generated

---

## Module 6 · Trend Detection

**The job:** spot what's rising before competitors. Shape, color, material shifts week over week.

**Today:** `/api/visual-trends` runs Gemini Vision on top 40 posts, extracts `{shape, color, material, lens_type, style}`, computes deltas vs prior week, generates Weekly Must-Do via Gemini text. Works for the global feed, no regional cuts yet.

**Tomorrow:**
- **Run weekly across all 5 regions** (NA, EU, SA, APAC, MEA) for cut-by-region trends
- **Material trends** — acetate vs metal vs titanium share over time
- **Color heatmap** — which colors are spiking in which regions
- **Hashtag velocity** — rising tags week over week with engagement weighting
- **Influencer trend alerts** — when 5+ micro-influencers wear the same shape in 2 weeks
- **Editorial digest** — auto-publish a weekly "The Edit" (PDF/email) summarizing trend moves, sent to team
- **Backtest accuracy** — track Weekly Must-Do recommendations vs actual sales 90 days later

---

## Module 7 · Reimagine Studio

**The job:** generate Lenskart/JJ-branded creative from any source post in 30 seconds.

**Today:** `/reimagine` page with FLUX Kontext + Schnell via Replicate. Persists to Vercel Blob. Logs each generation to `brand_content` with `parent_id` linking to source post.

**Tomorrow:**
- **Per-brand reimagine history** on the brand detail page
- **Brand kit** — pick a target brand (Lenskart / JJ / Vincent Chase), auto-apply its color palette + frame catalog
- **Batch reimagine** — pick 10 source posts, generate 10 variants in parallel
- **Side-by-side comparison** — original vs Kontext vs Schnell vs Pollinations
- **Approval flow** — flag generated images for review before they leave the system
- **Brand-safe filter** — auto-reject Vision-flagged unsafe outputs
- **Export to Notion / Slack / Sheets** for handoff to social team

---

## Module 8 · Team Workflow

**The job:** make Lenzy a daily-use tool for 10–50 internal Lenskart employees with proper auth, roles, collab.

**Today:** auth scaffolded (HMAC-cookie + Google OAuth + email allowlist) but not enforced by default. Watchlist + Boards in localStorage, not DB-backed.

**Tomorrow:**
- **Google Workspace SSO** required — no public access
- **Roles:** Admin (all CRUD + user mgmt + audit log) · Editor (CRUD on brands/people/content) · Viewer (read-only)
- **User table** with profile, role, last login, watchlist, preferences
- **Watchlist** scoped per-user, DB-backed
- **Boards** scoped per-user OR shared with team
- **Comments** — thread on any post, brand, product, person
- **@mentions** to ping team members in comments
- **Activity feed** — "Emma just added 5 brands · Peyush starred Gentle Monster"
- **Slack integration** — send brand pages, posts, reimagines to a channel
- **Saved searches** — "amber cat-eye acetate sunglasses, EU, last 30 days" with email alerts

---

## Module 9 · Data Export & API

**The job:** download everything, enrich externally (Manus, Perplexity, ChatGPT), re-upload.

**Today:** `/api/brands/export` returns brand summary or per-brand deep CSV. CSV upload at `/api/brands/upload` and `/api/people/upload` with header alias matching.

**Tomorrow:**
- **Versioned API** at `/api/v1/...`
- **OpenAPI spec** auto-generated for downstream tooling
- **Scheduled exports** — daily/weekly CSV emailed to specified addresses
- **Bulk upload validation** — preview before commit, conflict resolution
- **External enrichment loop** — built-in "send to Perplexity for enrichment" button per brand
- **Webhooks** — push events (new brand, price change, person move) to Slack/Notion
- **GraphQL endpoint** for custom queries by power users

---

## Module 10 · Admin & Observability

**The job:** keep the system healthy, see what's used, audit who did what.

**Today:** zero observability. Errors in Vercel logs only. No usage metrics. No audit log. Cron health invisible.

**Tomorrow:**
- **Sentry** for errors and exceptions (UI + API)
- **PostHog** for usage analytics — which tabs, which brands, which features
- **Audit log table** — every mutation: who, what, when, before/after state
- **Cron health dashboard** — last run per cron, success/fail count, average duration, brands hit
- **API usage stats** — `/api/usage` endpoint surfaces per-endpoint call counts
- **Data quality dashboard** — completeness % distribution, brands with stale data, broken images, dead URLs
- **Cost monitoring** — daily Apify + Gemini + Replicate spend with alerts at thresholds
- **Backup verification** — Supabase point-in-time recovery + monthly export to S3
