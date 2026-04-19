# Lenzy v9 — Data Quality Report & SLM Training Guide

**Version:** 9.0
**Generated:** 2026-04-20
**Upstream:** `Global_Eyewear_Database_v8_Final.json` (Manus AI output, 3,095 companies)

---

## 1 · Executive summary

The Manus v8 database delivered real scaffolding — 3,095 companies, 30,998 sitemap-derived product URLs, 1,598 people names, 1,982 sitemap crawl records — but it interleaved hallucinated "enrichment" fields with real data. Training an SLM on v8 as-shipped would teach the model fabricated engagement rates, fake Instagram post IDs, and unsourced revenue figures as if they were ground truth.

v9 is the cleaned, provenance-tagged corpus: **3,068 companies + 5,006 celebrities + 30,818 product URLs** with every field labeled as `source_v8`, `unverified_llm_estimate`, `removed_fabricated`, or `missing`. Only verified and verifiable fields should feed the SLM training set.

---

## 2 · What Manus fabricated (evidence)

### 2.1 Instagram "recent_posts" arrays
Every one of the 865 `instagram_stats.recent_posts` arrays used the same templated shortcode pattern:

```
https://www.instagram.com/p/Cq1X7YzL9aA/   (100% Speedcraft)
https://www.instagram.com/p/Cp9VxQ7L2bB/   (100% Speedcraft)
https://www.instagram.com/p/Cp2X9JzK3cC/   (100% Speedcraft)
```

Real Instagram shortcodes are 11 characters of `[A-Za-z0-9_-]`. Manus emitted 11-character shortcodes always starting with `C` followed by 1-2 digits, then a predictable `XYzL9aA`/`VxQ7L2bB` pattern — clearly templated. **Zero of the sampled URLs resolve to real posts.**

**Action:** all 865 `recent_posts` arrays dropped (`provenance.recent_posts = "removed_fabricated"`).

### 2.2 Engagement rate clustering
The top "engagement rates" across 865 brands formed a suspicious distribution:

| Rate | Count | Real IG likelihood |
|------|------:|-------|
| 2.7% | 47 | Highly improbable — IG rates are continuous |
| 3.8% | 44 | Same |
| 5.6% | 42 | Same |
| 3.5% | 37 | Same |
| 3.0% | 28 | Round-number hallucination |

Real engagement rates never cluster on round decimals across hundreds of brands. Manus sampled from a small set of plausible-sounding values.

**Action:** all 865 `engagement_rate`, `avg_likes`, `avg_comments`, `posting_frequency`, `content_style`, and `bio` fields dropped.

### 2.3 Revenue strings
1,016 companies had `revenue_latest_usd` set to string values like `"$50M"`, `"$1B+"`, `"$100M"` — no `revenue_year`, no source citation, no revenue_growth. These are LLM guesses tied to brand-name recognition, not reported figures.

**Action:** parsed to `revenue_usd_estimate` integer AND flagged `provenance.revenue_usd = "unverified_llm_estimate"`. Kept for the SLM only as features, never as training targets.

### 2.4 Employee / store counts
3,057 companies had `employees_total` and `number_of_stores` as string values (`"100"`, `"500"`, `"0"`) with no source. Same pattern as revenue.

**Action:** parsed to integers, flagged as unverified estimates.

### 2.5 Follower counts
All 3,095 companies had `instagram.followers` as strings like `"500K"`, `"1.2M"`. Many of these are directionally correct for well-known brands (Ray-Ban, Gucci) but wrong for long-tail ones.

**Action:** parsed to `instagram_followers` integer when format-valid. Marked as `source_v8`. Re-verification cron will overwrite with real Apify profile-stat values.

---

## 3 · What v9 kept (and verified against structure)

| Field | v8 count | v9 count | Trust |
|-------|---------:|---------:|-------|
| Company name | 3,095 | 3,068 | High |
| Website (format-valid) | 1,982 | 1,954 | High |
| Instagram handle (format-valid) | 1,294 | 1,267 | Medium — format only |
| LinkedIn URL | 2,630 | 2,630 | High |
| Country (with ISO codes) | 3,019 | 3,068 | High — ISO added |
| Founded year (plausible range) | 2,810 | 2,806 | Medium |
| Key people with title | 1,598 | 1,562 | High — name+title non-empty |
| Sitemap has_sitemap=true | 497 | 492 | High — real crawl |
| Product URLs from sitemap | 30,998 | 30,818 | High — real scrape |

**Merges:** 27 duplicate rows merged on (handle, domain, name+country). 0 quarantined for empty names after merge.

---

## 4 · v9 provenance model

Every company row has a `data_quality.provenance` object:

```json
{
  "name": "source_v8",
  "website": "source_v8",
  "ig_handle": "source_v8",
  "ig_followers": "source_v8",
  "country": "source_v8",
  "founded_year": "source_v8",
  "revenue_usd": "unverified_llm_estimate",
  "employees": "unverified_llm_estimate",
  "stores": "unverified_llm_estimate",
  "description": "unverified_llm_summary",
  "ig_stats_aggregates": "removed_fabricated",
  "recent_posts": "removed_fabricated"
}
```

Every row also has `data_quality.needs_reverification = true` — the re-verification cron (`/api/cron/enrich-crunchbase`, `linkedin-sync`, `ig-profile-stats`) flips fields to `verified_live` + adds `data_quality.sources[]` as it confirms each value from a first-party source.

---

## 5 · Celebrity DB quality (5,006 rows)

| Region | Count | With IG handle | High eyewear affinity |
|--------|------:|------:|------:|
| India | 1,117 | ~720 | ~310 |
| US | 818 | ~570 | ~260 |
| East Asia (Korea) | 585 | ~420 | ~150 |
| Global | 564 | ~340 | ~180 |
| Southeast Asia | 486 | ~270 | ~110 |
| UK/Europe | 371 | ~210 | ~110 |
| Latin America | 336 | ~190 | ~90 |
| Middle East | 329 | ~160 | ~120 |
| Africa | 240 | ~90 | ~50 |
| Oceania | 160 | ~80 | ~30 |
| **Total** | **5,006** | **3,006** | **1,414** |

**IG handle policy:** When the subagent was not confident, it set `instagram_handle = null` rather than guessing. **2,000 rows have null handle** — these are queued for handle-resolution (`/api/cron/resolve-celeb-handles` — new cron to build in Phase 5).

**eyewear_affinity = "high"** seeds the first vision-scan cohort (1,414 celebs × 10 posts × 6-hour cron ≈ 56k candidate eyewear photos/week, or ~14k real eyewear photos/week at a ~25% detection rate).

---

## 6 · What's safe to train the SLM on

### 6.1 Clean training pairs — use these

**Company structured features:**
- (name, country, iso_alpha2, iso_alpha3, region, hq_city) — categorical identifiers
- (category, subcategory, business_type, business_model, price_tier, distribution_channel) — class labels
- (flags.is_d2c, is_manufacturer, is_retailer, is_luxury, is_smart_eyewear, has_manufacturing, sustainability_focus) — binary features
- (founded_year, naics_code, sic_code) — structured numerics
- (digital.website, instagram_handle, linkedin_url) — URL features
- (sitemap.has_sitemap, total_urls, product_count) — real-scrape signals

**Celebrity structured features:**
- (name, region, country, category, gender, eyewear_affinity)
- (instagram_handle, instagram_url) — only when handle is non-null
- (known_eyewear_brands) — join target against company brands

**Real scraped content (when the ingestion pipeline produces it):**
- brand_content rows with `source_platform` set and `source_ref` resolving to a real URL
- products table entries with real `url` hitting a 200 response
- vision.eyewear_regions arrays from Gemini Vision (not Manus)

### 6.2 Quarantine for SLM — filter OUT before training

Any row where `provenance.<field>` equals:
- `"removed_fabricated"` — never train on these
- `"unverified_llm_estimate"` — only train on these if you're learning "brand-to-tier mapping as LLM perceives it," not "ground truth revenue"
- `"unverified_llm_summary"` — the `description` text — OK for retrieval-style tasks, NOT for factual QA

### 6.3 Recommended training filter (SQL)

```sql
-- Train set: only fields with source_v8 or verified_live provenance
SELECT
  id, handle, name, country, iso_alpha2, region, hq_city,
  category, subcategory, business_type, business_model, price_tier,
  founded_year,
  flags,
  digital->>'website' AS website,
  digital->>'instagram_handle' AS ig_handle,
  digital->>'instagram_followers' AS ig_followers,
  digital->>'linkedin_url' AS linkedin_url,
  sitemap->>'product_count' AS product_count
FROM tracked_brands
WHERE provenance->>'name' IN ('source_v8','verified_live')
  AND provenance->>'ig_stats_aggregates' != 'removed_fabricated';  -- redundant but explicit
```

For the SLM's "knowledge text" embedding, concatenate:
```
{name} is a {category} eyewear brand ({business_type}) headquartered in {hq_city}, {country}.
Founded {founded_year}. {subcategory}. Price tier: {price_tier}.
Ownership: {ownership_type}. Parent: {parent_company}.
Distribution: {distribution_channel}. Focus: {product_focus}.
Tags: {tags joined by ', '}.
Description: {description}.  # NOTE: this line is unverified_llm_summary — flag in training metadata
Digital: {website} · @{instagram_handle} · {linkedin_url}.
```

---

## 7 · Re-verification plan (for production crons)

Five crons must run before v9 data is considered production-verified:

| Cron | Cadence | Updates |
|------|---------|---------|
| `ig-profile-stats` | Daily per brand | Real followers, verified, bio, posting frequency |
| `linkedin-sync` | Weekly | Employee count, HQ, founded year from LinkedIn |
| `enrich-crunchbase` | Weekly | Funding, revenue, ownership, stock ticker |
| `resolve-celeb-handles` | One-off + weekly | Fill null IG handles via Brave Search + manual review queue |
| `sitemap-parse` | Weekly | Fresh product URLs from all 3,068 brands (currently only 216 have product URLs) |

Each cron writes `provenance.<field> = "verified_live"` and appends to `data_quality.sources[]`:
```json
{ "field": "employee_count", "source": "linkedin.com/company/lenskart", "fetched_at": "2026-04-20T04:12:00Z" }
```

Only fields with `verified_live` provenance should flow into the SLM's factual QA training examples. `source_v8` fields are good for retrieval / classification; `unverified_llm_estimate` fields should be held out entirely or only used as weak labels.

---

## 8 · What's shipped in v9 release

```
/home/user/workspace/lenzy_v9/
├── data/
│   ├── companies_v9.json            3,068 companies, 7.3 MB, provenance-tagged
│   ├── companies_v9.jsonl           Same, newline-delimited for streaming ingestion
│   ├── companies_v9_tracked_brands.csv   SQL COPY-ready seed (1.1 MB)
│   ├── companies_v9_quarantine.json Rows dropped for irreparable issues (0 after merge)
│   ├── companies_v9_report.json     Machine-readable quality stats
│   ├── celebrities_v9.json          5,006 celebs, 3.1 MB
│   └── celebrities_v9.csv           465 KB, 5,007 lines
├── sql/                             15 files, 3,315 lines — full Supabase migration
├── docs/
│   ├── VISION_PIPELINE.md           969 lines — end-to-end vision moat spec
│   └── DATA_QUALITY_REPORT.md       this file
├── code/
│   ├── ingestion/                   10 TypeScript ingestion modules
│   ├── api/cron/                    5 Vercel cron route handlers
│   ├── scripts/                     5 Python seed + backfill scripts
│   ├── vercel.json.patch            7 cron entries to merge
│   └── PR_DESCRIPTION.md            366 lines — paste-ready PR body
└── scripts/
    ├── clean_v8.py                  the cleaner used to produce companies_v9.*
    └── build_celebs.py              the celebrity DB builder
```

6,153 lines of TypeScript/Python ingestion code, 3,315 lines of SQL, 1,200 lines of docs, 3,068 + 5,006 = 8,074 structured rows.

---

## 9 · Next steps for Claude Code (not done in this session)

Ordered by priority — the PR description repeats these but the TL;DR:

1. Apply SQL migrations 0001–0011, then 0020, then 0030.
2. Run `seed_companies_from_v9.py` and `seed_celebrities_from_json.py`.
3. Split `src/app/[[...slug]]/page.tsx` (4,770 lines) per the `features/` layout in the Claude Code brief §3.
4. Remove hardcoded base64 fallbacks for `GEMINI_API_KEY` and `REPLICATE_API_TOKEN`. Fail fast if missing.
5. Enable Supabase RLS on all tables (migration `0020_rls_policies.sql`).
6. Add Sentry + pino (replace every `console.log`).
7. Repoint cron writers off legacy tables (`ig_posts`, `products`, `celeb_photos`) to `brand_content`.
8. Wire the five new cron routes in `code/api/cron/` into `vercel.json` (patch provided).
9. Run `backfill_product_embeddings.py` once migrations are live.
10. Build the editor review queue UI (materialized view `mv_editor_review_queue` ready in `0040_review_queue.sql`).

That's the path from "MVP with hallucinated data" to "production knowledge layer powering a Lenskart-grade SLM."
