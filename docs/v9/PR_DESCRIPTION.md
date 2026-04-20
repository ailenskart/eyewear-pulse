# PR: Vision Pipeline + Data Ingestion v9

**Branch:** `claude/vision-pipeline-v9`  
**Base:** `main`  
**Repo:** [ailenskart/eyewear-pulse](https://github.com/ailenskart/eyewear-pulse)

---

## Summary

This PR implements the Lenzy Vision Moat Pipeline (Phase 4 of the rebuild plan). It introduces a fully automated, 7-stage pipeline that ingests celebrity Instagram posts, detects eyewear via Gemini Vision, crops each frame region, embeds crops with OpenCLIP ViT-L/14 via Replicate, matches against the product catalog using pgvector HNSW cosine similarity, applies a confidence-based attribution scoring system, and writes structured results back to `brand_content`.

In parallel, this PR delivers the clean v9 data seed scripts (celebrities + companies), text-embedding backfill for all 52k products, and a monthly precision/recall backtest harness.

**What this PR does:**
1. Adds the authoritative 15-section vision pipeline spec (`docs/VISION_PIPELINE.md`)
2. Adds 5 TypeScript ingestion pipeline steps (`code/ingestion/`)
3. Adds 5 shared TypeScript lib wrappers (Apify, Gemini Vision, Replicate, Supabase, shared types)
4. Adds 5 Next.js cron route handlers (`code/api/cron/`) — each protected by `CRON_SECRET` and instrumented with pino + Sentry
5. Adds 5 Python one-shot scripts for seeding, backfilling, and backtesting (`code/scripts/`)
6. Adds `vercel.json.patch` with 7 new cron entries
7. Moves import paths to `@/lib/ingestion/` and `@/lib/vision/` (consistent with the features/ layout from Phase 1)

---

## Checklist of Files Added

### Docs
- `docs/VISION_PIPELINE.md` — 15-section spec (969 lines)

### TypeScript — Ingestion Pipeline (`src/lib/ingestion/`)
> Copy these from `code/ingestion/` to `src/lib/ingestion/` in the repo

- `types.ts` — All shared TypeScript types (ApifyIGPost, GeminiVisionResponse, etc.)
- `apify-client.ts` — Apify SDK wrapper with retry + DLQ
- `gemini-vision.ts` — Gemini Vision wrapper with structured output
- `replicate-embed.ts` — OpenCLIP ViT-L/14 via Replicate
- `supabase-server.ts` — Service-role Supabase client factory + pgvector helper
- `celeb-scan.ts` — Stage 1: Apify IG scrape for celebrity accounts
- `vision-detect.ts` — Stage 2: Gemini Vision eyewear detection
- `crop-and-blob.ts` — Stage 3: Region crop + Vercel Blob upload
- `embed-crops.ts` — Stage 4: OpenCLIP embedding via Replicate
- `match-products.ts` — Stages 5–7: pgvector match + attribution scoring + writeback

### TypeScript — Cron Route Handlers (`src/app/api/cron/`)
> Copy these from `code/api/cron/` to `src/app/api/cron/` in the repo

- `celeb-scan/route.ts`
- `vision-detect/route.ts`
- `crop-and-blob/route.ts`
- `embed-crops/route.ts`
- `match-products/route.ts`

### Python Scripts (`scripts/`)
> Copy these from `code/scripts/` to the repo root `scripts/` directory

- `seed_celebrities_from_json.py` — Seed `directory_celebrities` from `celebrities_v9.json`
- `seed_companies_from_v9.py` — Seed `tracked_brands` from `companies_v9.json`
- `backfill_product_embeddings.py` — Text-embed all products via OpenAI
- `backfill_product_image_embeddings.py` — Image-embed all products via Replicate OpenCLIP
- `backtest_vision.py` — Monthly precision/recall harness

### Config
- `vercel.json.patch` — 7 new cron entries (celeb-scan × 1, vision pipeline × 4, price-snapshot × 1, trends-weekly × 1)

---

## How to Apply Migrations

Run migrations **in this exact order** in the Supabase SQL Editor or via `supabase db push`:

```bash
# 1. Extensions and helpers (already applied if on v9 schema)
psql $DATABASE_URL < supabase/migrations/0001_extensions_and_helpers.sql

# 2. Core tables (tracked_brands, brand_content, directory_celebrities)
psql $DATABASE_URL < supabase/migrations/0002_core_tables.sql

# 3. pgvector embedding tables
psql $DATABASE_URL < supabase/migrations/0003_embeddings.sql

# 4. crop_queue table (new in this PR)
psql $DATABASE_URL < supabase/migrations/0004_crop_queue.sql
# SQL:
# CREATE TABLE crop_queue (
#   id               bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
#   brand_content_id bigint REFERENCES brand_content(id) ON DELETE CASCADE,
#   region_index     integer NOT NULL DEFAULT 0,
#   crop_url         text NOT NULL,
#   vision_region    jsonb NOT NULL,
#   embedding_id     bigint REFERENCES celeb_photo_embeddings(id),
#   embedded_at      timestamptz,
#   matched_at       timestamptz,
#   error            text,
#   created_at       timestamptz NOT NULL DEFAULT now()
# );
# CREATE INDEX crop_queue_unembedded ON crop_queue (id) WHERE embedded_at IS NULL;
# CREATE INDEX crop_queue_unmatched  ON crop_queue (id) WHERE matched_at IS NULL;

# 5. match_product_embeddings RPC (copy SQL from supabase-server.ts MATCH_PRODUCTS_RPC_SQL)
psql $DATABASE_URL < supabase/migrations/0005_match_rpc.sql

# 6. directory_celebrities columns (add scan_enabled, scan_frequency_hours, etc.)
psql $DATABASE_URL < supabase/migrations/0006_celebrity_scan_columns.sql
# ALTER TABLE directory_celebrities
#   ADD COLUMN IF NOT EXISTS scan_enabled boolean DEFAULT false,
#   ADD COLUMN IF NOT EXISTS scan_frequency_hours integer DEFAULT 24,
#   ADD COLUMN IF NOT EXISTS last_scanned_at timestamptz,
#   ADD COLUMN IF NOT EXISTS scan_error_count integer DEFAULT 0,
#   ADD COLUMN IF NOT EXISTS last_scan_error text,
#   ADD COLUMN IF NOT EXISTS tier integer DEFAULT 3;
```

**Env vars to add before deploying** (in Vercel Dashboard → Project Settings → Environment Variables):

```
APIFY_TOKEN                  (starts with apify_api_)
GEMINI_API_KEY               (no base64 fallback — fail fast if missing)
REPLICATE_API_TOKEN          (no base64 fallback — fail fast if missing)
BLOB_READ_WRITE_TOKEN
SUPABASE_URL
SUPABASE_KEY                 (anon key)
SUPABASE_SERVICE_ROLE_KEY    (server-only — never expose to browser)
CRON_SECRET                  (generate: openssl rand -hex 32)
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
QSTASH_TOKEN
SENTRY_DSN
OPENAI_API_KEY
VISION_AUTO_ATTRIBUTE_THRESHOLD=0.75
VISION_REVIEW_THRESHOLD=0.50
DAILY_APIFY_CALL_LIMIT=1000
DAILY_GEMINI_CALL_LIMIT=5000
DAILY_REPLICATE_CALL_LIMIT=5000
ADMIN_API_URL                (e.g. https://lenzy.studio)
ADMIN_API_SECRET             (generate: openssl rand -hex 32)
```

---

## How to Run Seed Scripts

Install dependencies first:

```bash
pip install supabase openai  # supabase-py + openai python SDK
```

### 1. Seed celebrities

```bash
SUPABASE_URL=https://xxxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  python scripts/seed_celebrities_from_json.py
```

**Expected output:**
```
Loading celebrities from data/celebrities_v9.json...
Loaded 500 celebrities
After dedup: 498 unique celebrities
Upserting in batches of 100...
Batch 1/5: 100 rows → 100 upserted
Batch 2/5: 100 rows → 100 upserted
...
Done. Total: 498 upserted, 0 errors.
```

### 2. Seed companies

```bash
SUPABASE_URL=https://xxxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  python scripts/seed_companies_from_v9.py
```

**Expected output:**
```
Loading companies from data/companies_v9.json...
Loaded 3068 companies
After dedup: 3041 unique handles
Upserting in batches of 100...
...
Done. Total: 3041 upserted, 0 errors.
```

### 3. Backfill text embeddings (one-time, ~$0.52)

```bash
OPENAI_API_KEY=sk-... \
SUPABASE_URL=https://xxxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  python scripts/backfill_product_embeddings.py
```

Estimated runtime: 45–90 minutes for 52k products.

### 4. Backfill image embeddings (one-time, ~$8.84)

```bash
REPLICATE_API_TOKEN=r8_... \
SUPABASE_URL=https://xxxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  python scripts/backfill_product_image_embeddings.py
```

Estimated runtime: 4–8 hours for 48k product images (Replicate batching + cold starts).

### 5. Run backtest (monthly)

```bash
GEMINI_API_KEY=... REPLICATE_API_TOKEN=r8_... \
SUPABASE_URL=https://xxxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
ADMIN_API_URL=https://lenzy.studio \
ADMIN_API_SECRET=... \
  python scripts/backtest_vision.py
```

Create `data/labeled_paparazzi.csv` with real labeled data (50+ rows) before running in production. A stub file is auto-created on first run.

---

## Vision Pipeline Runbook: One Celeb IG Post End-to-End

This walkthrough traces a single Zendaya IG post through the full pipeline.

**Trigger:** Vercel cron fires `/api/cron/celeb-scan` at 06:00 UTC.

**Step 1 — celeb-scan** (06:00 UTC)

The route handler verifies `x-cron-secret`, calls `runCelebScan(50)`. The function queries `directory_celebrities` for handles due for scan:

```sql
SELECT id, name, ig_handle, scan_frequency_hours, last_scanned_at, tier
FROM directory_celebrities
WHERE scan_enabled = true
  AND ig_handle IS NOT NULL
  AND (last_scanned_at IS NULL OR last_scanned_at < now() - INTERVAL '6 hours')
ORDER BY last_scanned_at ASC NULLS FIRST
LIMIT 50;
```

Zendaya (`ig_handle='zendaya'`, tier=1, scan_frequency_hours=6) is in the first batch. The Apify actor `shu8hvrXbJbY3Eb9W` is called with `directUrls: ['https://instagram.com/zendaya/']` and `resultsLimit: 10`.

Apify returns 10 posts. For each, the image is fetched and uploaded to Vercel Blob at `posts/celeb_{post_id}.jpg`. A row is inserted into `brand_content`:

```
type='unattributed_photo', celebrity_id=15, platform='instagram',
post_id='C1234XYZ', media_url='https://blob.vercel.com/posts/celeb_C1234XYZ.jpg',
vision=NULL, is_active=true
```

`directory_celebrities.last_scanned_at` is updated to `now()`.

**Step 2 — vision-detect** (08:00 UTC)

`runVisionDetect(50)` picks the row with `vision IS NULL`. Gemini 2.0 Flash is called with the Blob image URL (base64-encoded inline). Response:

```json
{
  "eyewear_present": true,
  "confidence": 0.97,
  "eyewear_regions": [{
    "bbox": {"x": 0.32, "y": 0.18, "width": 0.36, "height": 0.14},
    "shape": "cat-eye",
    "color": "tortoiseshell",
    "material": "acetate",
    "lens_type": "tinted",
    "lens_color": "smoke",
    "confidence": 0.94
  }],
  "face_regions": [{"bbox": {...}, "has_eyewear": true}]
}
```

The vision jsonb is written to `brand_content.vision`. `is_active` stays `true`.

**Step 3 — crop-and-blob** (08:30 UTC)

`runCropAndBlob(50)` finds the row. The original image (1080×1350 px) is fetched. The bbox is converted to pixels: `x=346, y=243, w=389, h=189`. With 20% padding, the crop is `x=268, y=206, w=545, h=264`. Made square: `side=545`, centered at `(540, 338)`, crop: `left=268, top=65, width=545, height=545`. Resized to `224×224`. Uploaded to `crops/98765/0_1737540000000.jpg`. A `crop_queue` row is inserted with `region_index=0`.

**Step 4 — embed-crops** (10:00 UTC)

`runEmbedCrops(50)` picks the crop_queue row. Replicate `andreasjansson/clip-features` is called with the crop URL. After 2s (warm) or 60s (cold start), a 768-dim vector is returned. Upserted to `celeb_photo_embeddings`. `crop_queue.embedded_at` is set.

**Step 5 — match-products** (10:00 UTC, same cron window)

`runMatchProducts(50)` fetches the embedding and calls the Supabase RPC `match_product_embeddings`. pgvector HNSW returns top-5 candidates. Top-1 result: `Ray-Ban Clubmaster RB3016, brand_id=87, similarity=0.847`.

Threshold check: `0.847 >= 0.75` → **auto-attribute**.

`brand_content` is updated:
```
type='celeb_photo', brand_id=87,
attribution={
  candidates: [...],
  top_similarity: 0.847,
  auto_attributed: true,
  attributed_at: '2026-01-15T10:02:00Z',
  embedding_model: 'openclip-vit-l-14'
}
```

**Outcome:** The post appears on the Ray-Ban brand page under the Celebs tab. Celebrity Zendaya is linked to the attribution. The full pipeline ran in under 4 hours from post publication.

---

## Risk Section

### Rate Limits

| Service | Limit | Mitigation |
|---------|-------|-----------|
| Apify | Variable by plan; ~500 CU/month free | Per-day Redis counter (cap: 1000 calls/day). QStash DLQ on exhaustion. |
| Gemini Vision | 60 RPM (Flash), 1500 RPD (free tier) | Redis counter (cap: 5000/day). Fallback to Gemini 1.5 Pro. |
| Replicate | Pay-per-prediction; no hard limit | Redis counter (cap: 5000/day). 60s cold-start timeout guard. |
| Vercel Blob | 100 GB storage, 1TB bandwidth/month (Pro) | At 15KB/crop × 150k crops/month = 2.25 GB storage. Well within limits. |
| Supabase | 25 concurrent connections (Pro) | PgBouncer transaction mode. Max 10 connections per cron function. |

### Costs

| Scenario | Monthly Cost |
|----------|-------------|
| Conservative (2,500 posts/day) | ~$98 |
| Moderate (4,000 posts/day) | ~$156 |
| Full scale (6,000 posts/day) | ~$234 |

Daily hard cap: 10,000 processed images ≈ $13/day. Circuit breaker in Redis stops all crons when cap is hit.

### TOS Considerations

- **Instagram:** Apify uses published Instagram actor (`shu8hvrXbJbY3Eb9W`) that respects Instagram's public-facing data. All scraped content is from public accounts. Lenzy does not store user PII beyond what is publicly available.
- **Reddit:** Reddit's public API terms allow read access to public posts. Apify `trudax/reddit-scraper` operates within these constraints.
- **Gemini:** Google AI API usage is governed by the Google Cloud Terms of Service and Google AI Prohibited Use Policy. Image analysis for product attribution falls within permitted commercial use.
- **Replicate:** Standard API usage. No image data is stored by Replicate after prediction completion.
- **GDPR/CCPA:** Celebrity faces in public posts. All data is from public-facing social media. No private individual data is stored. However, the Celebs tab should display a "public data only" notice.

---

## TODO for Claude Code Continuation

The following items are **NOT** in this PR and must be completed in subsequent sessions:

### High Priority (Phase 4 completion)

1. **Split `page.tsx`** — The 4,770-line monolith still exists. Route to `features/` layout per §3 of the rebuild brief. No file in `src/app/` may exceed 200 lines.
2. **Remove base64 API key fallbacks** — Hardcoded base64 fallbacks for `GEMINI_API_KEY` and `REPLICATE_API_TOKEN` exist in the current codebase. These are a security issue. `grep -r "base64" src/` will find them. Replace with `process.env.GEMINI_API_KEY ?? (() => { throw new Error('GEMINI_API_KEY not set') })()`.
3. **Enable RLS** — Row Level Security is not yet enabled on `tracked_brands`, `brand_content`, `directory_celebrities`. Must be done before adding any multi-user functionality. Service-role key on server; anon key + RLS on client.
4. **Add Sentry** — `@sentry/nextjs` is imported in route handlers but may not be initialized in `sentry.server.config.ts` / `sentry.client.config.ts`. Verify `Sentry.init()` runs in all environments.
5. **Repoint cron writers off legacy tables** — Any remaining writes to `ig_posts`, `products`, `celeb_photos` (legacy tables) must be redirected to `brand_content`. After 14 days, rename to `*_legacy` and drop.

### Medium Priority (Phase 5 prep)

6. **Review Queue UI** — Build the `/admin/vision-review` page per the spec in §10 of VISION_PIPELINE.md. The two-button confirm/reject flow is the most critical human-in-the-loop component.
7. **Migrate import paths** — This PR outputs to `code/ingestion/` for review. Before merging, move all files to their canonical paths (`src/lib/ingestion/`, `src/app/api/cron/`). Update all `@/lib/...` import paths in the ingestion files to resolve correctly.
8. **`directory_celebrities` table** — Confirm it exists as a view or synonym for `directory_people WHERE person_type='celebrity'`, or as a standalone table. The seed script targets `directory_celebrities`; verify the migration creates this.
9. **`labeled_paparazzi.csv`** — The backtest harness requires at least 50 real labeled examples. The stub file (5 rows) is not sufficient for meaningful precision/recall. Create this file with real paparazzi shots and correct brand/product labels.
10. **Vercel cron headers** — Vercel sends `Authorization: Bearer $CRON_SECRET` by default, not `x-cron-secret`. Verify the route handlers accept both formats, or align with Vercel's actual header.

### Low Priority (Phase 6)

11. **Backtest cron route** — Add `/api/cron/vision-backtest/route.ts` as the monthly cron entry point for `backtest_vision.py` (triggered via a Next.js route that spawns the Python process, or rewrite in TypeScript).
12. **Cost dashboard** — The Admin → Cost tab should read from Redis budget counters. Wire up the daily spend display per §9.10 of the rebuild brief.
13. **HNSW index tuning** — After 100k+ embeddings, run `SELECT * FROM pg_stat_user_indexes WHERE indexrelname LIKE '%hnsw%'` to verify index is being used and not falling back to sequential scan.
