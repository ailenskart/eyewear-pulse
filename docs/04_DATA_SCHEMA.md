# Lenzy — Data Schema

## The two-table architecture (core)

Lenzy runs on a deliberately small schema. **Two tables hold 95% of the data.** Everything else is audit logs.

```
                ┌──────────────────────┐
                │   tracked_brands     │  3,500+ rows
                │   (master directory) │
                └──────────┬───────────┘
                           │ id (bigserial PK)
                           │
            ┌──────────────┼──────────────┐
            ↓              ↓              ↓
   ┌────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ brand_content  │  │ directory_people │  │ feed_cron_runs   │
   │ (everything)   │  │ (denormalized    │  │ (audit)          │
   │ 163,000+ rows  │  │  people view)    │  │                  │
   │ 12 types       │  │ 1,612 rows       │  │                  │
   └────────────────┘  └──────────────────┘  └──────────────────┘
```

**Why this works:** every new content type (Pinterest pin, news article, ad creative, store opening) is just a new row in `brand_content` with a new `type` value. No schema migration. The system grows by data, not by code.

---

## Table 1 · `tracked_brands`

Master brand directory. Every player in the eyewear industry.

**Primary key:** `id (bigserial)`. **Natural key:** `handle (text unique)`.

### Columns by group

**Identity**
- `id` bigserial PK
- `handle` text unique (Instagram handle, doubles as URL slug)
- `name` text — display name
- `description` text — long-form about
- `notes` text — internal notes
- `tags` text[] — free-form labels

**Geography**
- `country` text
- `iso_code` text — ISO 3-letter code
- `region` text — North America / Europe / Asia / etc
- `hq_city` text
- `source_country` text — where products are manufactured (vs HQ)

**Business**
- `category` text — Luxury / D2C / Sports / Heritage / Streetwear / Tech / Sustainable / Kids
- `subcategory` text — Sunglasses / Optical / Both / Smart
- `business_type` text — Brand / Fashion House / Retailer / Online Retailer / Marketplace
- `business_model` text — D2C / Wholesale / Licensed / Franchise
- `distribution_channel` text — Online / Boutiques / Wholesale + Online
- `product_focus` text — "Cycling/Motocross Sunglasses" specificity
- `price_range` text — Budget / Mid / Premium / Luxury / Prestige
- `founded_year` int

**Flags (boolean)**
- `is_d2c` · `is_manufacturer` · `is_retailer` · `is_luxury` · `is_independent` · `is_smart_eyewear` · `has_manufacturing` · `has_sitemap`

**Ownership / financial**
- `parent_company` text
- `ownership_type` text — Private / Public / PE-owned / VC-backed / Family
- `is_public` boolean
- `stock_ticker` text
- `employee_count` int
- `store_count` int
- `revenue_estimate` numeric (USD annual)
- `monthly_traffic` text — "500K" format

**Leadership**
- `ceo_name` text

**Classification**
- `naics_code` text
- `sic_code` text
- `sustainability_focus` text — Yes / No / Partial / descriptive

**Social URLs (canonical)**
- `website` text
- `instagram_url` text
- `facebook_url` text
- `twitter_url` text
- `tiktok_url` text
- `youtube_url` text
- `linkedin_url` text
- `logo_url` text

**Metrics**
- `instagram_followers` bigint
- `product_urls_found` int
- `total_sitemap_urls` int
- `key_people_count` int
- `confidence_pct` int (0-100, user-set)
- `completeness_pct` int (0-100, auto-computed)

**Operational**
- `tier` text — fast / mid / full (controls cron frequency)
- `active` boolean
- `source` text — seed / upload / manual / xlsx_import
- `posts_scraped` int — running counter
- `last_scraped_at` timestamptz
- `added_at` timestamptz
- `added_by` text

**Flex catch-all**
- `details` jsonb — anything not modeled
- `people` jsonb (deprecated, use directory_people instead)

**Indexes**
- Primary key on `id`
- Unique on `handle`
- B-tree on `category`, `region`, `tier`, `iso_code`, `parent_company`, `ownership_type`
- Partial index on `active = true`
- Partial indexes on each flag where true
- GIN on `tags`
- GIN trigram on `name` for search

---

## Table 2 · `brand_content`

The polymorphic content table. Every piece of anything tied to a brand.

**Primary key:** `id (bigserial)`. **FK:** `brand_id → tracked_brands.id`.

**The killer column:** `type` — identifies what this row represents.

### Valid `type` values today

| type | source | count | what it represents |
|---|---|---|---|
| `ig_post` | apify cron | 2,045 | Instagram post (image, caption, engagement) |
| `product` | scraper + xlsx | 52,451 | Product SKU with price |
| `person` | xlsx + LinkedIn | 1,598 | Person at the brand (CEO, founder, etc) |
| `celeb_photo` | celeb cron | 12 | Photo of celebrity wearing this brand |
| `reimagine` | reimagine route | 0 | Lenskart-branded creative variant |
| `website_link` | xlsx import | 106,717 | Any URL — blog / sitemap / page / collection |
| `tiktok` | future | 0 | TikTok post |
| `youtube` | future | 0 | YouTube video |
| `linkedin_post` | future | 0 | Brand's LinkedIn post |
| `ad` | future | 0 | Ad creative (Meta Ad Library) |
| `news` | future | 0 | Press mention |
| `other` | misc | varies | Anything else |

### Columns by purpose

**Identity + linkage**
- `id` bigserial PK
- `brand_id` bigint → tracked_brands.id (FK should exist, currently soft)
- `brand_handle` text (denormalized for query convenience)
- `type` text NOT NULL
- `parent_id` bigint → brand_content.id (self-FK; for reimagines linking source posts)
- `source` text — apify / brave / manual / xlsx_import / reimagine / cron
- `source_ref` text — original ID from source system
- `is_active` boolean

**Universal content**
- `title` text
- `caption` text
- `description` text
- `url` text — canonical external link
- `image_url` text — original (may expire)
- `blob_url` text — Vercel Blob persisted (permanent)
- `video_url` text
- `thumbnail_url` text

**Engagement (reused across types)**
- `likes` int
- `comments` int
- `views` bigint
- `shares` int
- `engagement` numeric — computed engagement rate

**Product-specific (reused across types)**
- `price` numeric
- `compare_price` numeric
- `currency` text — USD / EUR / GBP / INR
- `product_type` text — frame type, category

**Person-specific (reused across types)**
- `person_name` text
- `person_title` text
- `linkedin_url` text
- `email` text
- `phone` text
- `location` text
- `department` text
- `seniority` text — C-Level / VP / Director / Manager / IC / Founder

**Celebrity-specific**
- `eyewear_type` text — "round gold metal aviators, possibly Ray-Ban"

**Classification**
- `tags` text[]
- `hashtags` text[]

**Catch-all**
- `data` jsonb — type-specific fields not modeled here

**Temporal**
- `posted_at` timestamptz — when source content was published
- `detected_at` timestamptz default now()
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

**Indexes (12 total)**
- B-tree on `brand_id`, `type`, `(brand_id, type)`, `parent_id`, `posted_at`, `detected_at`, `(source, source_ref)`
- GIN on `tags`, `hashtags`
- GIN trigram on `caption`, `title`

---

## Table 3 · `directory_people`

Denormalized view of persons. The People tab UI reads from here.

**Why a separate table:** the polymorphic `brand_content` has one row per (person, brand) pair. The directory needs one row per person with all their brand linkages aggregated.

**Columns:**
- `id` bigserial PK
- `name` text NOT NULL
- `title` text
- `department` text
- `seniority` text
- `linkedin_url` text (should be unique constraint)
- `photo_url` text
- `email` text
- `phone` text
- `location` text
- `company_current` text (display name)
- `brand_handles` text[] — denormalized for display
- `brand_ids` bigint[] — FK array into tracked_brands
- `previous_companies` text[]
- `tenure` text
- `bio` text
- `tags` text[]
- `source` text — manual / linkedin-scan / upload / xlsx_import
- `added_at` timestamptz
- `updated_at` timestamptz

**Indexes:**
- GIN trigram on `name`
- GIN on `brand_ids`, `brand_handles`, `tags`
- B-tree on `department`, `seniority`, `linkedin_url`, `company_current`, `added_at desc`

---

## Audit / log tables

**`feed_cron_runs`** — every rescrape run logged
- `id`, `tier`, `brands_hit`, `new_posts`, `duration_ms`, `ran_at`, `error`

**`celeb_scan_log`** — celebrity Vision scans
- `id`, `celeb_name`, `celeb_slug`, `candidates`, `detected`, `source`, `scanned_at`, `error`

**`brand_upload_log`** — every CSV/JSON upload
- `id`, `filename`, `format`, `total_rows`, `inserted`, `updated`, `skipped`, `summary` jsonb, `uploaded_by`, `uploaded_at`

**`brand_people_scan_log`** — LinkedIn people scrapes
- `id`, `brand_handle`, `linkedin_url`, `people_found`, `source`, `scanned_at`, `error`

---

## Tables to deprecate

These existed before the consolidation to `brand_content`. Data is duplicated. Drop after migrating writers.

- **`ig_posts`** (2,045 rows) — replaced by `brand_content` type=ig_post
- **`products`** (21,453 rows) — replaced by `brand_content` type=product
- **`celeb_photos`** (12 rows) — replaced by `brand_content` type=celeb_photo

---

## Tables from earlier projects (unused)

Visible in the schema but unrelated to brand intel pipeline:
- `knowledge_entries` (35 rows — Shiv-related)
- `queries` (466 rows)
- `price_history` (0 rows — placeholder)
- `weekly_diffs` (0 rows — placeholder)
- `scan_log` (0 rows)

Move to a separate schema or drop.

---

## Future tables to add (production)

**`users`** — auth + profiles
- `id`, `email`, `name`, `picture`, `role` (admin/editor/viewer), `last_seen_at`, `created_at`

**`watchlist`** — per-user pinned brands
- `id`, `user_id`, `brand_id`, `added_at`

**`boards`** — per-user or shared swipe files
- `id`, `name`, `owner_id`, `is_shared`, `description`

**`board_items`** — pinned brand_content into boards
- `id`, `board_id`, `content_id`, `note`, `added_at`

**`comments`** — threaded comments on any entity
- `id`, `user_id`, `entity_type` (brand/content/person), `entity_id`, `body`, `parent_id`, `mentions` text[], `created_at`

**`audit_log`** — every mutation
- `id`, `user_id`, `action`, `entity_type`, `entity_id`, `before` jsonb, `after` jsonb, `at` timestamptz

**`saved_searches`** — bookmarked filter combinations
- `id`, `user_id`, `name`, `filter_json`, `notify` boolean, `created_at`

**`alerts`** — what to notify users about
- `id`, `user_id`, `kind` (price_change/person_move/new_post), `target_id`, `delivered_at`, `seen_at`

**`product_embeddings`** — pgvector for similarity search
- `id`, `product_content_id`, `embedding` vector(1536), `model`, `created_at`

**`person_embeddings`** — pgvector for people search
- `id`, `person_content_id`, `embedding` vector(1536), `model`, `created_at`
