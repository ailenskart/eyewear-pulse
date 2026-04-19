# LENZY — Production Rebuild Brief

**For:** Lenskart leadership · new Claude session handoff
**Status:** MVP shipped. Ready for production rewrite.

---

## 1 · Vision (one paragraph)

Lenzy is the **central knowledge brain for eyewear, smart glasses, and the industry's people**. Every brand, every product ever scraped, every creative post, every celebrity/influencer seen wearing eyewear, every person building in the space — one searchable, exportable, team-accessible system. Lenskart's team uses it daily to (a) learn from everything happening globally, (b) move faster on creative + merchandising, (c) find and recruit talent from competitors.

---

## 2 · Users & jobs

| User | Job |
|---|---|
| Lenskart creative team | "What should we shoot this week based on what's working?" |
| Merchandising | "What shapes/colors/frames are trending? What should we stock?" |
| Founders | "Morning brief — one screen, everything that moved" |
| Talent / People ops | "Who could we hire from Warby / Gentle Monster / EssilorLuxottica?" |
| External (future) | Read-only API for approved partners |

---

## 3 · 10 modules — each with why + what

1. **Brand Ecosystem** — canonical directory of every eyewear player globally. *Why:* no single source of truth today. *What:* 3,500+ brands with full profile, per-brand deep-dive page, parent-subsidiary graph, comparison view.

2. **Product Intelligence** — every SKU scraped from every brand's site. *Why:* reactive merchandising needs real competitor data. *What:* 52k products today → 500k+ via sitemap parsing, price history, new-launch alerts, embedding similarity search.

3. **People Intelligence** — industry directory (founders, CEOs, designers, engineers). *Why:* hiring moat + relationship mapping. *What:* 1,612 people today → 10k+ via LinkedIn sync; "people who recently moved" feed; outreach workflow.

4. **Creative Intelligence** — every IG / TikTok / YouTube / Ad creative per brand. *Why:* creative iteration needs a swipe file the size of the market. *What:* Instagram feed across all 3,500 brands, ad library, creative briefs per brand.

5. **Celebrity & Influencer Layer** — who is wearing what, branded OR not. *Why:* spotting unlabeled trends is the real edge. *What:* Gemini Vision on any photo → detect eyewear → match to brand catalog via embeddings → surface micro-influencers before they're famous.

6. **Trend Detection** — weekly shape/color/material shift analysis. *Why:* answer "what's rising" with data, not vibes. *What:* Gemini Vision extraction on top posts, week-over-week deltas, regional cut, AI-generated Weekly Must-Do.

7. **Reimagine Studio** — generate Lenskart/JJ-branded creative from any image. *Why:* 10× creative team speed. *What:* FLUX Kontext + Blob persistence, parent-post linkage, per-brand history.

8. **Team Workflow** — auth, roles, boards, watchlist, comments, shares. *Why:* internal tool used by 10-50 people. *What:* Google SSO, Admin/Editor/Viewer roles, shared boards, comment threads, Slack/Notion exports.

9. **Data Export & API** — download everything, feed external AI. *Why:* Manus/Perplexity/ChatGPT enrichment loop. *What:* unified `/api/brands/export`, CSV + JSON, scheduled email digests.

10. **Admin & Observability** — bulk upload, audit logs, usage analytics, health monitoring. *Why:* production tool needs ops visibility.

---

## 4 · Per-brand deep-dive page (new)

Dedicated route `/brands/{id}` — one page per brand showing:

- Header: logo, #ID, name, category, ownership, parent, website, IG/FB/X/LI/YT/TT links
- Key stats: followers, employees, stores, revenue, founded, price tier
- Description + tags + notes
- Timeline: recent IG posts, product launches, people moves, news mentions (merged)
- People block: CEO + leadership + recent hires (LinkedIn photos)
- Products block: latest SKUs, price range, top-selling styles
- Celebrity block: celebs spotted wearing this brand
- Competitors: "who else operates in this space"
- Reimagine history: any Lenskart creative generated from this brand's posts
- Export button: download this brand's full profile as CSV/JSON

---

## 5 · Unbranded eyewear detection (the real edge)

Today we only detect eyewear on known-brand IG accounts. The bigger win: Gemini Vision on ANY photo (celeb pap shots, street style, reddit, UGC) → extract frame attributes → match via embedding similarity against our 52k product catalog → tag the brand.

Pipeline: public scrape (IG hashtags, Reddit, Pinterest) → Vision extraction `{shape, color, material, style}` → `pgvector` nearest-neighbor lookup → attribute to closest brand+SKU match → write to `brand_content` with confidence score.

---

## 6 · Auth + roles

- **Google SSO** (Workspace) — default
- **Email allowlist** fallback (lenzy.com domains + invited guests)
- Roles: **Admin** (all CRUD + user mgmt), **Editor** (CRUD on brands/people/content), **Viewer** (read-only)
- Per-user **Watchlist + Boards** scoped by user_id
- **Audit log** on every mutation (who/what/when)

---

## 7 · Paid API wishlist with monthly cost estimate

| API / Service | Use | Cost (monthly) | Must-have? |
|---|---|---|---|
| Apify | IG/TikTok/LinkedIn/Shopify scraping | $49 Starter → $199 Team | Yes (have it) |
| Brave Search | web/news/images | $5 free / $9 per 5k | Yes |
| Google Gemini | Vision + text | $0–$100 (free tier heavy) | Yes |
| Replicate | FLUX Kontext image gen | $0.003/image · ~$50 at volume | Yes |
| Vercel Blob | image storage | $20 (Pro) | Yes |
| Supabase | Postgres + auth + storage | $25 Pro | Yes |
| OpenAI / Cohere embeddings | product similarity, unbranded matching | $20–50 | **Add** |
| Meta Graph API / Ad Library | competitor ad spend intel | Free (needs Business verification) | **Add** |
| SimilarWeb API | traffic estimates per brand | $199 Basic | Add |
| Crunchbase API | funding / revenue / people | $49 Starter | Add |
| Pharos / Webz.io | news monitoring | $99+ | Optional |
| Hunter.io | email enrichment for people | $49 | Optional |
| Bright Data / ScrapingBee | fallback scraping proxies | $50–150 | Optional |
| Sentry | error monitoring | Free (team plan $26) | **Add** |
| PostHog or Vercel Analytics | usage tracking | Free tier | **Add** |
| Upstash QStash | cron retry + rate limiting | $10 | **Add** |
| Resend | transactional + digest emails | Free up to 3k/mo | **Add** |

**Estimated production monthly:** $400–800/month all-in.

---

## 8 · What's good today (keep)

- **Two-table architecture** (`tracked_brands` + `brand_content`) — right call, keep
- **Polymorphic content with `parent_id`** self-join — extend to all content types
- **Tiered crons** (fast/mid/full) — right balance of freshness + cost
- **Gemini Vision pipeline** for eyewear detection — works, scale it
- **Xlsx bulk upload with alias headers** — keep, extend to all tables
- **Blob-persisted reimagines** — apply this pattern to every generated/scraped image
- **Unified export** — keep, this is how external enrichment loop works

---

## 9 · What's MVP / needs rebuild

1. **Monolithic `page.tsx` (4,770 lines)** — split into feature folders
2. **No auth enforced** — allowlist exists but not active by default
3. **Hardcoded API keys in source** — `GEMINI_API_KEY` + `REPLICATE_API_TOKEN` base64-encoded. Delete.
4. **Three legacy duplicate tables** — `ig_posts`, `products`, `celeb_photos` alongside `brand_content`. Consolidate.
5. **No FK constraints** — orphans possible in `brand_content`, `directory_people`
6. **No RLS on Supabase** — anon key writes freely
7. **No rate limiting** — Gemini/Apify can be hammered
8. **No error monitoring** — errors only in Vercel logs
9. **No tests** — zero coverage
10. **No user system** — single-tenant, no roles, no per-user data
11. **No brand detail page** — brands only visible as table rows
12. **No unbranded detection** — Vision only runs on known-brand IG accounts
13. **No embedding search** — pgvector not installed
14. **No structured cron retry / DLQ** — fire and forget
15. **Inconsistent design language** — each tab looks different

---

## 10 · Phased rebuild (6 phases, 2–3 weeks each)

### Phase 1 · Foundations (week 1–2)
- Break `page.tsx` into `features/*` folders; extract design system primitives
- Add Zod validation on every API route
- Delete hardcoded secrets; enforce env vars
- Supabase RLS + service-role server client
- FK constraints + drop legacy `ig_posts` / `products` / `celeb_photos`
- Sentry wired · structured `pino` logs
- Tests: Vitest for utils + Playwright for 4 golden-path flows

### Phase 2 · Auth + users (week 3)
- Google SSO · email allowlist enforced
- Roles table (Admin / Editor / Viewer)
- Per-user Watchlist + Boards migrated to DB (from localStorage)
- Audit log table
- `/signin` redesigned with clear allowlist messaging

### Phase 3 · Brand detail page (week 4)
- Route `/brands/[id]` — per-brand deep dive page
- Timeline view merging posts + products + people + news
- Per-brand reimagine history
- Embedded comparison view
- Side panel: competitors + parent graph

### Phase 4 · Unbranded detection + embedding search (week 5–6)
- Install pgvector
- Embed all 52k products + 1.5k people descriptions
- Hashtag/Reddit/Pinterest scrapers writing to `brand_content` as unattributed
- Vision pipeline: unbranded photo → frame attrs → similarity match → attribute
- Confidence threshold + human review queue

### Phase 5 · Intelligence features (week 7)
- Meta Ad Library integration
- Crunchbase + SimilarWeb enrichment on brand save
- Daily email digest (Resend)
- "People who recently moved" feed
- LinkedIn sync job (weekly re-scrape existing profiles)

### Phase 6 · Polish + scale (week 8)
- Design system pass across every tab
- a11y baseline
- Loading skeletons + empty states
- Edge caching on feed + export
- Onboarding tour
- Admin dashboard (usage, errors, crons health)
- Public docs / runbook

---

## 11 · Database schema (for reference)

Two primary tables + support:

**`tracked_brands`** — master directory (3,500+ rows, 63 columns)
- PK: `id` (bigserial). Natural key: `handle` (unique).
- Identity: handle, name, category, business_type, country, iso_code, region, hq_city, founded_year, website.
- Social URLs: instagram_url, facebook_url, twitter_url, tiktok_url, youtube_url, linkedin_url.
- Business: parent_company, ownership_type, is_public, stock_ticker, employee_count, store_count, revenue_estimate, ceo_name, naics_code, sic_code.
- Flags: is_d2c, is_manufacturer, is_retailer, is_luxury, is_independent, is_smart_eyewear, has_manufacturing.
- Ops: tier (fast/mid/full), active, source, last_scraped_at, confidence_pct, completeness_pct.
- Flex: details (jsonb), tags (text[]), notes, description.

**`brand_content`** — polymorphic everything (163k rows, 45 columns)
- PK: `id` (bigserial). FK: `brand_id → tracked_brands.id`.
- Polymorphism: `type` ∈ {ig_post, product, person, celeb_photo, reimagine, website_link, tiktok, youtube, linkedin_post, ad, news, other}.
- Self-join: `parent_id → brand_content.id` (reimagine → source post, product variant → parent).
- Universal: title, caption, description, url, image_url, blob_url, video_url, thumbnail_url.
- Type-specific columns reused across types: price, currency (products); person_name, person_title, linkedin_url (people); eyewear_type (celeb); likes, comments, views (engagement).
- Flex: `data` jsonb for any type-specific extras.

**`directory_people`** — people directory (1,612 rows) — denormalized view of persons for the People tab UI. `brand_ids[]` + `brand_handles[]` arrays.

Support tables: `feed_cron_runs`, `celeb_scan_log`, `brand_upload_log`, `brand_people_scan_log`.

Legacy (delete after phase 1): `ig_posts`, `products`, `celeb_photos`.

---

## 12 · Success metrics (what "production grade" means)

- **Data depth:** 5,000+ brands, 250k products, 10k people, 100k+ creative posts, 1k+ celebrity eyewear moments
- **Freshness:** priority brands ≤1h old, all brands ≤24h old, celebs refresh 4h
- **Reliability:** p99 API latency <2s, uptime >99.5%, zero silent cron failures
- **Team adoption:** 10+ daily active Lenskart users, 100+ weekly brand detail page views
- **Hiring outcome:** 3+ people sourced via Lenzy in first quarter
- **Creative outcome:** 50+ reimagines generated monthly, used in production briefs
- **Time to insight:** team goes from "what's trending" question → answer in <30s

---

## 13 · What I'm asking you to redline

1. Is the vision in §1 right?
2. Are the 10 modules the right scope, or should any be cut/added?
3. Is the per-brand deep-dive the right shape?
4. Is the unbranded detection pipeline worth the build effort?
5. Paid API wishlist — any you want removed or added?
6. Phased plan — is 8 weeks realistic from your side (review cadence, user feedback)?
7. Auth via Google SSO ok, or do you want SAML / Workspace-specific?
8. Single-tenant (Lenskart only) forever, or design for multi-tenant from the start?

Redline this doc, send it back, and I'll start Phase 1.
