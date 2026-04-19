# Lenzy Vision Moat Pipeline
## Authoritative Specification — Phase 4

**Version:** 1.0  
**Date:** 2026-01  
**Repo:** ailenskart/eyewear-pulse  
**Branch:** claude/vision-pipeline-v9  

---

## 1. Overview + Architecture

The Vision Moat Pipeline is the highest-leverage feature in Lenzy. It continuously ingests celebrity and street-fashion imagery, detects eyewear frames using Gemini Vision, crops each frame region, embeds the crop with OpenCLIP, and matches it against the product catalog using pgvector. The result is automatic attribution of celebrity eyewear to specific brand SKUs — a workflow that previously required hours of manual research per photo.

### Why This Is Defensible

- **Data flywheel:** Every matched photo strengthens the product embedding corpus.  
- **Review loop:** Human confirmations in the 0.5–0.75 confidence band create labeled training data for future fine-tuning.  
- **Speed:** Attribution happens within 2 hours of a post going live on Instagram.  
- **Breadth:** 500+ celebrity accounts × multiple hashtag streams × Reddit = thousands of raw frames per day.

### Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INPUT SOURCES                               │
│  IG Celebrity Accounts   IG Hashtag Streams   Reddit   Fashion Press │
│       (500 handles)       (#sunglasses etc.)  (3 subs)  (RSS feeds) │
└────────────┬────────────────────┬──────────────┬─────────┬──────────┘
             │                    │              │         │
             └──────────┬─────────┘              │         │
                        │         Apify actors   │         │
                        ▼                        ▼         ▼
             ┌─────────────────┐       ┌───────────────────────┐
             │  Stage 1        │       │  Future: RSS ingest   │
             │  Apify Ingest   │       │  (Phase 5)            │
             │  IG Actor:      │       └───────────────────────┘
             │  shu8hvrXbJbY3  │
             │  Reddit Actor:  │
             │  trudax/reddit  │
             └────────┬────────┘
                      │  raw rows → brand_content
                      │  type='unattributed_photo'
                      ▼
             ┌─────────────────┐
             │  Stage 2        │
             │  Gemini Vision  │──── eyewear_present=false ──► is_active=false (skip)
             │  Detection      │
             └────────┬────────┘
                      │  vision jsonb written to brand_content
                      │  eyewear_present=true
                      ▼
             ┌─────────────────┐
             │  Stage 3        │
             │  Crop + Upload  │
             │  Vercel Blob    │
             └────────┬────────┘
                      │  crop rows → crop_queue table
                      ▼
             ┌─────────────────┐
             │  Stage 4        │
             │  OpenCLIP Embed │  ← Replicate: andreasjansson/clip-features
             │  768-dim vector │
             └────────┬────────┘
                      │  upsert → celeb_photo_embeddings
                      ▼
             ┌─────────────────┐
             │  Stage 5        │
             │  pgvector Match │  ← HNSW cosine top-5 vs product_embeddings
             └────────┬────────┘
                      │  similarity scores
                      ▼
             ┌─────────────────┐
             │  Stage 6        │
             │  Attribution    │
             │  Scoring        │
             └────────┬────────┘
              ┌───────┼──────────────┐
              │       │              │
           >0.75    0.5–0.75       <0.5
              │       │              │
              ▼       ▼              ▼
         auto-      review       unattributed
         attribute  queue        (trend data only)
              │       │              │
              └───────┴──────────────┘
                      │
                      ▼
             ┌─────────────────┐
             │  Stage 7        │
             │  Writeback      │
             │  brand_content  │
             │  type='celeb_   │
             │  photo' or      │
             │  'unattributed_ │
             │  photo'         │
             └─────────────────┘
```

### Cron Schedule Summary

| Step | Cron | Route |
|------|------|-------|
| celeb-scan | Every 6 hours | `/api/cron/celeb-scan` |
| vision-detect | Every 2 hours | `/api/cron/vision-detect` |
| crop-and-blob | Every 2 hours | `/api/cron/crop-and-blob` |
| embed-crops | Every 2 hours | `/api/cron/embed-crops` |
| match-products | Every 2 hours | `/api/cron/match-products` |

---

## 2. Input Sources

### 2.1 Celebrity Instagram Handles

Source table: `directory_celebrities` (aliased from `directory_people` with `person_type='celebrity'`).

Relevant columns:

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint | PK |
| `ig_handle` | text | e.g. `zendaya` |
| `scan_enabled` | boolean | Default false; admin opt-in |
| `last_scanned_at` | timestamptz | Nullable |
| `scan_frequency_hours` | integer | Default 24; min 6 for Tier 1 celebs |
| `tier` | integer | 1=mega (>10M), 2=macro (1-10M), 3=mid |

**Active scan set:** 500 celebrities in Tier 1 and Tier 2 with `scan_enabled=true`. Tier 1 scans every 6 hours; Tier 2 every 24 hours; Tier 3 every 72 hours.

**Bootstrapping:** `seed_celebrities_from_json.py` reads `data/celebrities_v9.json` and upserts into `directory_celebrities`. Initial batch covers ~500 verified celeb handles with eyewear affinity (actors, musicians, athletes, fashion influencers).

### 2.2 Eyewear Hashtag Streams

Scraped via Apify IG Hashtag actor (`apify/instagram-hashtag-scraper` or `shu8hvrXbJbY3Eb9W` in hashtag mode) on a daily schedule.

| Hashtag | Approx daily posts | Priority |
|---------|-------------------|----------|
| `#sunglasses` | 12,000 | High |
| `#eyewearfashion` | 2,500 | High |
| `#specsstyle` | 800 | Medium |
| `#eyewearcommunity` | 600 | Medium |
| `#frames` | 4,000 | Medium |
| `#opticalframes` | 300 | Low |
| `#luxuryeyewear` | 1,200 | High |
| `#designersunglasses` | 1,800 | Medium |

Limit: top 100 most-engaged posts per hashtag per run. Source: rows land in `brand_content` with `type='unattributed_photo'`, `celebrity_id=NULL`, `source_ref={platform:'instagram', hashtag:'#sunglasses', post_id:'...'}`.

### 2.3 Reddit Subreddits

Scraped via Apify Reddit actor (`trudax/reddit-scraper`). Fetches top-50 posts per run (sorted by new).

| Subreddit | Focus |
|-----------|-------|
| `r/glasses` | Prescription frames, style advice |
| `r/sunglasses` | Sunglass reviews and fits |
| `r/eyewear` | Brand discussions, unboxings |

Reddit images are lower-confidence for celebrity attribution but extremely valuable for trend detection (shape, color, material aggregation). Rows land with `source_ref.platform='reddit'`.

### 2.4 Fashion-Press RSS Feeds (Phase 5)

| Source | RSS URL | Cadence |
|--------|---------|---------|
| Vogue (US) | `https://www.vogue.com/feed/rss` | Daily |
| WWD | `https://wwd.com/feed/` | Daily |
| The Eyewear | `https://www.theeyewear.com/feed` | Daily |
| ELLE | `https://www.elle.com/rss/all.xml/` | Daily |

Images extracted from article bodies. Only posts containing eyewear-related keywords in title or metadata are forwarded to vision detection.

---

## 3. Stage 1 — Apify Ingestion

### Actor IDs

| Source | Actor ID | Notes |
|--------|----------|-------|
| Instagram profiles | `shu8hvrXbJbY3Eb9W` | Existing actor in production |
| Instagram hashtags | `shu8hvrXbJbY3Eb9W` | Same actor, `resultsType:'hashtag'` |
| Reddit | `trudax/reddit-scraper` | ~$0.10/1k posts |
| Pinterest | `epctex/pinterest-scraper` | Phase 5 |

### Rate Limits

| Tier | Daily Posts | Apify Compute Units | Est. Cost |
|------|-------------|---------------------|-----------|
| Celeb scan (500 handles × 5–10 posts) | 2,500–5,000 | 8–16 CU | $2.40–$4.80 |
| Hashtag streams (8 tags × 100 posts) | 800 | 3 CU | $0.90 |
| Reddit (3 subs × 50 posts) | 150 | 0.5 CU | $0.15 |
| **Daily total** | **3,450–6,000** | **11.5–19.5 CU** | **$3.45–$5.85** |

Compute Unit price reference: Apify charges $0.40 per actor compute unit (standard memory, 2026 rates). One IG profile scrape (5 posts) ≈ 0.0016 CU.

### Polling Model

The `celeb-scan` cron uses **synchronous wait** (`waitForFinish=300`). For batches of 10 handles at a time, this keeps individual HTTP requests within the 10-minute Vercel function limit.

For large hashtag scrapes, the cron fires an async Apify run and stores the `runId` in a `cron_jobs` table. A polling cron checks status every 2 minutes and retrieves results when `status=SUCCEEDED`.

```
POST /v2/acts/{actorId}/runs
  → returns { data: { id: runId, status: 'RUNNING' } }

GET /v2/acts/{actorId}/runs/{runId}
  → poll until status ∈ ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED']

GET /v2/datasets/{defaultDatasetId}/items
  → paginate with limit=1000 if needed
```

### Error Handling

| Error | Detection | Recovery |
|-------|-----------|---------|
| 401 Unauthorized | HTTP 401 or token regex fail | Alert to Sentry, skip run, increment `error_count` |
| 429 Rate limit | HTTP 429 or `TOO_MANY_REQUESTS` | Exponential backoff (1s, 2s, 4s); after 3 retries, push run to QStash DLQ |
| Run TIMED_OUT | `status=TIMED_OUT` | Retry with `memoryMbytes=1024`; log partial results |
| Run FAILED | `status=FAILED` | Write to `cron_jobs.error_log`, Sentry capture, skip |
| Empty dataset | 0 items returned | Warn in logs; not a fatal error |
| CDN URL expiry | Image 403 after >1h | Immediate blob upload on ingest (same pattern as existing `scrape-brands.ts`) |

### Output to Staging Table

Each Apify post is immediately written to `brand_content`:

```sql
INSERT INTO brand_content (
  brand_id,           -- NULL for unattributed
  celebrity_id,       -- directory_celebrities.id if from celeb scan
  type,               -- 'unattributed_photo'
  platform,           -- 'instagram' | 'reddit' | 'hashtag_instagram'
  post_id,            -- Apify post id / shortCode
  media_url,          -- Vercel Blob URL (uploaded immediately)
  thumbnail_url,      -- same or smaller variant
  caption,            -- post caption text
  hashtags,           -- text[]
  posted_at,          -- original post timestamp
  likes_count,        -- integer
  comments_count,     -- integer
  source_ref,         -- jsonb: { platform, actor_id, apify_run_id, original_url }
  vision,             -- jsonb: NULL (to be filled by Stage 2)
  is_active,          -- true initially
  data                -- jsonb catch-all
)
ON CONFLICT (platform, post_id) DO NOTHING;
```

The `ON CONFLICT DO NOTHING` ensures idempotency — re-running the cron on the same time window never duplicates rows.

---

## 4. Stage 2 — Gemini Vision Eyewear Detection

### Model

`gemini-2.0-flash-exp` (or `gemini-1.5-pro` for fallback). Flash is preferred for cost and latency; Pro for complex multi-face images when Flash confidence is ambiguous.

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`

### Exact Prompt

```
You are an eyewear detection specialist. Analyze the provided image carefully.

Your task:
1. Determine if any eyewear (sunglasses, optical frames, sports glasses) is visible on any person in the image.
2. For each eyewear item detected, identify its bounding box, shape, color, material, and lens type.
3. For each face visible, provide a bounding box.

Return ONLY a JSON object matching the schema below. Do not include any text outside the JSON.

Schema:
{
  "eyewear_present": boolean,
  "confidence": number,          // 0.0 to 1.0 — overall confidence in detection
  "eyewear_regions": [
    {
      "bbox": {
        "x": number,             // normalized 0.0–1.0 from left
        "y": number,             // normalized 0.0–1.0 from top
        "width": number,         // normalized width
        "height": number         // normalized height
      },
      "shape": string,           // "aviator" | "wayfarer" | "round" | "cat-eye" | "square" | "oversized" | "shield" | "sport" | "geometric" | "other"
      "color": string,           // primary frame color: e.g. "tortoiseshell", "black", "gold", "silver", "clear", "brown", "blue", "red", "white", "multicolor"
      "material": string,        // "acetate" | "metal" | "titanium" | "wood" | "plastic" | "mixed" | "unknown"
      "lens_type": string,       // "tinted" | "mirrored" | "clear" | "photochromic" | "polarized" | "unknown"
      "lens_color": string,      // e.g. "smoke", "brown", "green", "blue", "pink", "clear", "gold mirror"
      "confidence": number       // 0.0 to 1.0 — confidence for this specific region
    }
  ],
  "face_regions": [
    {
      "bbox": {
        "x": number,
        "y": number,
        "width": number,
        "height": number
      },
      "has_eyewear": boolean     // true if this face has eyewear from eyewear_regions
    }
  ]
}

If eyewear_present is false, return eyewear_regions: [] and set confidence accordingly.
Normalize all bounding box coordinates to 0.0–1.0 relative to image dimensions.
```

### JSON Response Schema (for `responseSchema` field)

```json
{
  "type": "object",
  "properties": {
    "eyewear_present": { "type": "boolean" },
    "confidence": { "type": "number" },
    "eyewear_regions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "bbox": {
            "type": "object",
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" },
              "width": { "type": "number" },
              "height": { "type": "number" }
            },
            "required": ["x", "y", "width", "height"]
          },
          "shape": { "type": "string" },
          "color": { "type": "string" },
          "material": { "type": "string" },
          "lens_type": { "type": "string" },
          "lens_color": { "type": "string" },
          "confidence": { "type": "number" }
        },
        "required": ["bbox", "shape", "color", "material", "lens_type", "confidence"]
      }
    },
    "face_regions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "bbox": {
            "type": "object",
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" },
              "width": { "type": "number" },
              "height": { "type": "number" }
            }
          },
          "has_eyewear": { "type": "boolean" }
        }
      }
    }
  },
  "required": ["eyewear_present", "confidence", "eyewear_regions", "face_regions"]
}
```

### Cost (Gemini 2.0 Flash, 2026 rates)

- Input: ~$0.075 per 1M tokens. Average image = ~1,000 tokens.
- Output: ~$0.30 per 1M tokens. JSON response ≈ 200 tokens.
- **Per image: ~$0.000075 (input) + $0.000060 (output) ≈ $0.000135**
- **Per 1,000 images: ~$0.135**

### Write-back

After Gemini responds, the pipeline writes:

```sql
UPDATE brand_content
SET
  vision = $gemini_response::jsonb,
  is_active = CASE WHEN ($gemini_response->>'eyewear_present')::boolean THEN true ELSE false END,
  updated_at = now()
WHERE id = $row_id;
```

---

## 5. Stage 3 — Crop + Blob Upload

### Crop Algorithm

For each `eyewear_region` in `vision.eyewear_regions`:

1. Fetch original image (from `media_url` — already in Vercel Blob).
2. Decode dimensions (width W, height H).
3. Compute pixel bbox:
   - `px = bbox.x * W`
   - `py = bbox.y * H`
   - `pw = bbox.width * W`
   - `ph = bbox.height * H`
4. Apply 20% padding:
   - `pad_x = pw * 0.2`
   - `pad_y = ph * 0.2`
   - `crop_x = max(0, px - pad_x)`
   - `crop_y = max(0, py - pad_y)`
   - `crop_w = min(W - crop_x, pw + 2 * pad_x)`
   - `crop_h = min(H - crop_y, ph + 2 * pad_y)`
5. Make square: take `side = max(crop_w, crop_h)`, center the crop, clamp to image bounds.
6. Resize to 224×224 pixels (OpenCLIP input size).
7. Encode as JPEG quality 90.

### Blob Upload Path

```
crops/{brand_content_id}/{region_index}_{timestamp}.jpg
```

Example: `crops/98765/0_1737492000000.jpg`

### crop_queue Table

Each crop generates one row in `crop_queue`:

```sql
CREATE TABLE crop_queue (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  brand_content_id bigint REFERENCES brand_content(id) ON DELETE CASCADE,
  region_index    integer NOT NULL DEFAULT 0,
  crop_url        text NOT NULL,
  vision_region   jsonb NOT NULL,  -- the eyewear_region object
  embedding_id    bigint REFERENCES celeb_photo_embeddings(id),
  embedded_at     timestamptz,
  matched_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crop_queue_unembedded
  ON crop_queue (id)
  WHERE embedded_at IS NULL;
```

### Implementation Note

Image manipulation uses the `sharp` npm package (available in Vercel Serverless Functions as a native dependency). The crop is done in-memory: fetch → Buffer → sharp().extract().resize() → upload buffer to Blob.

---

## 6. Stage 4 — Image Embedding

### Model Selection: OpenCLIP ViT-L/14

**Choice: OpenCLIP ViT-L/14** (768-dimensional vectors)

**Justification vs. Cohere Embed v3 Multimodal (1024-dim):**

| Factor | OpenCLIP ViT-L/14 | Cohere Embed v3 Multimodal |
|--------|-------------------|---------------------------|
| Dimensionality | 768 | 1024 |
| Latency on Replicate | ~2s cold, ~0.3s warm | N/A (API call) |
| Cost per 1k images | ~$0.17 (Replicate) | ~$0.10 (API) |
| Open-source | Yes | No |
| Fine-tunable | Yes | No |
| Existing support | Replicate model `andreasjansson/clip-features` | Would need new integration |
| Visual domain alignment | Trained on web images including fashion/product | General-purpose |

OpenCLIP is chosen because:
1. It is open-source and fine-tunable — if the eyewear domain proves to need a specialized model, we can fine-tune OpenCLIP on our labeled crop data without vendor lock-in.
2. The `andreasjansson/clip-features` model on Replicate is already the standard for CLIP-based embeddings in the community and has a stable API.
3. The 768-dim vectors work well with pgvector HNSW; 1024-dim would slightly increase index size.
4. Visual domain alignment: CLIP was trained specifically on image-text pairs from the web, which closely mirrors product catalog + fashion editorial images.

### Replicate Model

```
Model: andreasjansson/clip-features
Version: (use latest pinned version from Replicate)
Input: { inputs: [{ image: "data:image/jpeg;base64,..." }] }
Output: [{ embedding: number[] }]  // 768 floats
```

Batch up to 5 images per Replicate call to reduce cold-start overhead.

### Vector Storage

```sql
CREATE TABLE celeb_photo_embeddings (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  crop_queue_id   bigint REFERENCES crop_queue(id) ON DELETE CASCADE,
  brand_content_id bigint REFERENCES brand_content(id) ON DELETE CASCADE,
  embedding       vector(768) NOT NULL,
  model           text NOT NULL DEFAULT 'openclip-vit-l-14',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX celeb_photo_embeddings_hnsw
  ON celeb_photo_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 7. Stage 5 — pgvector Matching Against product_embeddings

### HNSW Parameters

Both `product_embeddings` and `celeb_photo_embeddings` use:
- Index type: HNSW (`hnsw`)
- Operator: `vector_cosine_ops`
- `m = 16`: number of bi-directional links per node (good balance of recall vs. index size)
- `ef_construction = 64`: quality of graph construction (higher = better recall, slower build)
- `ef_search = 100`: set at query time for high-recall search (`SET hnsw.ef_search = 100`)

At 52k products with 768-dim vectors, the HNSW index occupies approximately:
- `52,000 × 768 × 4 bytes × 1.3 (HNSW overhead) ≈ 208 MB` — comfortably within Supabase Pro limits.

### Match Query

```sql
-- Run inside match-products step for each new celeb_photo_embedding
SET hnsw.ef_search = 100;

SELECT
  pe.id                                   AS product_embedding_id,
  pe.product_id,
  pe.brand_id,
  pe.product_name,
  pe.product_image_url,
  1 - (cpe.embedding <=> pe.embedding)    AS similarity
FROM celeb_photo_embeddings cpe
CROSS JOIN product_embeddings pe
WHERE cpe.id = $embedding_id
ORDER BY cpe.embedding <=> pe.embedding
LIMIT 5;
```

**Important:** The `<=>` operator returns cosine *distance* (0 = identical, 2 = opposite). Similarity = `1 - distance`. Values close to 1.0 mean highly similar.

### Results

The top-5 matches are stored as a jsonb array in `brand_content.attribution`:

```json
{
  "candidates": [
    {
      "rank": 1,
      "product_id": 12345,
      "brand_id": 87,
      "product_name": "Ray-Ban Aviator Classic RB3025",
      "similarity": 0.892,
      "product_image_url": "https://..."
    },
    ...
  ],
  "top_similarity": 0.892,
  "embedding_model": "openclip-vit-l-14",
  "matched_at": "2026-01-15T14:23:00Z"
}
```

---

## 8. Stage 6 — Attribution Scoring

### Threshold Logic

| Similarity | Action | `brand_content` outcome |
|------------|--------|------------------------|
| `>= 0.75` | Auto-attribute | `type` → `'celeb_photo'`, `brand_id` set, `attribution.confidence` = top-1 similarity |
| `0.50 – 0.74` | Review Queue | `type` stays `'unattributed_photo'`, `attribution.review_status = 'pending'`, `attribution.confidence` set |
| `< 0.50` | Discard match | `type` stays `'unattributed_photo'`, `attribution.review_status = 'no_match'` |

### Review Queue

A row enters the review queue when `attribution.review_status = 'pending'`. The admin UI query:

```sql
SELECT
  bc.*,
  dc.name                  AS celebrity_name,
  dc.ig_handle,
  bc.attribution           AS attribution_data
FROM brand_content bc
LEFT JOIN directory_celebrities dc ON bc.celebrity_id = dc.id
WHERE
  bc.type = 'unattributed_photo'
  AND bc.attribution->>'review_status' = 'pending'
ORDER BY bc.created_at DESC
LIMIT 50;
```

### Backfeed for Fine-Tuning

Human confirmations from the review queue are written back with:

```json
{
  "review_status": "confirmed",
  "confirmed_by": "<user_id>",
  "confirmed_at": "<timestamp>",
  "confirmed_product_id": 12345,
  "confirmed_brand_id": 87
}
```

Rejections:

```json
{
  "review_status": "rejected",
  "human_rejected": true,
  "rejected_by": "<user_id>",
  "rejected_at": "<timestamp>"
}
```

These labeled examples feed the monthly backtest harness and can be used for future model fine-tuning.

---

## 9. Stage 7 — Writeback to brand_content

### Auto-Attribute Path (similarity >= 0.75)

```sql
UPDATE brand_content
SET
  type            = 'celeb_photo',
  brand_id        = $top_brand_id,
  attribution     = $attribution_jsonb::jsonb,
  updated_at      = now()
WHERE id = $row_id;
```

The `attribution` jsonb structure for auto-attributed rows:

```json
{
  "candidates": [...],
  "top_similarity": 0.892,
  "auto_attributed": true,
  "attributed_at": "2026-01-15T14:23:00Z",
  "embedding_model": "openclip-vit-l-14",
  "gemini_eyewear_region": { ... }
}
```

### Unattributed Path (similarity 0.5–0.75 or <0.5)

Row keeps `type='unattributed_photo'`. The `attribution` jsonb records the confidence band and pending/no_match status. These rows still contribute to trend aggregation:

- Shape/color/material counts are incremented in the trend pipeline regardless of attribution status.
- The `/api/v1/trends` endpoint reads from `brand_content` WHERE `type IN ('celeb_photo', 'unattributed_photo')` and aggregates `vision->>shape`, `vision->>color`, `vision->>material`.

### Promotion on Human Confirm

When an editor confirms a match in the review queue:

```sql
UPDATE brand_content
SET
  type        = 'celeb_photo',
  brand_id    = $confirmed_brand_id,
  attribution = attribution || $confirm_patch::jsonb,
  updated_at  = now()
WHERE id = $row_id;
```

---

## 10. Review Queue UX

### Layout

The Review Queue is accessible at `/admin/vision-review`. It requires Admin or Editor role.

```
┌─────────────────────────────────────────────────────────────────┐
│  Vision Review Queue                     [Bulk Confirm] [Bulk Reject] │
│  Pending: 127  |  Auto-attributed today: 843  |  No match: 312  │
├──────┬──────────┬──────────┬────────────┬────────────┬──────────┤
│  □   │ Celebrity│ Post Image│ Crop       │ Top Match  │ Actions  │
│      │ Name     │ (thumb)   │ (thumb)    │ (sim score)│          │
├──────┼──────────┼──────────┼────────────┼────────────┼──────────┤
│  □   │ Zendaya  │ [img]     │ [crop img] │ Ray-Ban    │ ✓ Confirm│
│      │ @zendaya │          │            │ Aviator    │ ✗ Reject  │
│      │          │          │            │ (0.71)     │           │
├──────┼──────────┼──────────┼────────────┼────────────┼──────────┤
│  □   │ Rihanna  │ [img]     │ [crop img] │ Tom Ford   │ ✓ Confirm│
│      │ @badgalriri│         │            │ FT0823     │ ✗ Reject  │
│      │          │          │            │ (0.67)     │           │
└──────┴──────────┴──────────┴────────────┴────────────┴──────────┘
```

### Interactions

- **Single Confirm:** POST `/api/v1/admin/vision-review/confirm` with `{ brand_content_id, product_id, brand_id }`
- **Single Reject:** POST `/api/v1/admin/vision-review/reject` with `{ brand_content_id }`
- **Multi-select:** Checkbox on each row. Header checkbox selects all visible.
- **Bulk Confirm:** Applies top-1 match to all selected rows. Requires confidence >= 0.60 on each row (guard against accidental bulk-confirm of weak matches).
- **Bulk Reject:** Sets all selected to `human_rejected=true`.
- **Pagination:** 50 rows per page, sorted by `created_at DESC`.
- **Filter bar:** Filter by celebrity, confidence band, date range, eyewear shape.
- **Keyboard:** `J/K` navigate rows, `C` confirm focused row, `R` reject, `Space` toggle checkbox.

---

## 11. Backtest Harness

### Purpose

Monthly job that runs the full pipeline against 50 manually-labeled paparazzi shots to measure attribution precision and recall. Alerts if precision falls below 0.70.

### Labeled Data Format

File: `data/labeled_paparazzi.csv`

```csv
image_url,celebrity_name,ig_handle,brand_id,product_id,product_name,source
https://...,Zendaya,zendaya,87,12345,"Ray-Ban Aviator Classic",paparazzi
https://...,Rihanna,badgalriri,143,67890,"Gentle Monster Heizer 01",paparazzi
...
```

Minimum 50 rows; aim for 200+ over time. Include:
- 20+ distinct celebrities across Tier 1 and Tier 2
- 10+ distinct brands (luxury, D2C, sports)
- Mix of shapes: aviator, wayfarer, round, cat-eye, oversized

### Harness Steps

1. For each row in `labeled_paparazzi.csv`:
   a. Synthetically create a `brand_content` row (type=`unattributed_photo`, real image URL, celebrity_id matched by ig_handle).
   b. Run Stage 2 (Gemini detection).
   c. Run Stage 3 (crop).
   d. Run Stage 4 (embed).
   e. Run Stage 5 (match).
   f. Record top-1 predicted product_id and similarity.

2. Compare predicted `product_id` vs. labeled `product_id`:
   - **True Positive (TP):** predicted product_id matches label AND similarity >= 0.75
   - **False Positive (FP):** similarity >= 0.75 but wrong product_id
   - **False Negative (FN):** correct product_id exists in top-5 but similarity < 0.75

3. Compute metrics:
   ```
   Precision = TP / (TP + FP)
   Recall    = TP / (TP + FN)
   F1        = 2 * (Precision * Recall) / (Precision + Recall)
   ```

### Alert Logic

If `precision < 0.70`:
1. Log warning via pino: `logger.warn({ precision, recall }, 'Vision backtest: precision below threshold')`
2. Post to Sentry as a warning event.
3. Call admin dashboard API: `POST /api/v1/admin/alerts` with severity=`high`.
4. Raise auto-attribution threshold from 0.75 to 0.80 by updating an environment variable / admin config.

### Schedule

Monthly, first Sunday of each month at 2:00 AM UTC. Add to Vercel cron:
```json
{ "path": "/api/cron/vision-backtest", "schedule": "0 2 1-7 * 0" }
```

---

## 12. Cost Model (Per 1,000 IG Posts)

All rates are realistic 2026 estimates.

### Per-Post Cost Breakdown

| Stage | Service | Unit Cost | Per 1k Posts |
|-------|---------|-----------|--------------|
| Stage 1: Apify IG scrape | Apify | $0.40/CU; ~0.0016 CU/post | **$0.64** |
| Stage 2: Gemini Vision | Google AI | ~$0.000135/image | **$0.135** |
| Stage 3: Vercel Blob writes | Vercel Blob | $0.023/GB write + $0.09/GB/mo | **~$0.02** |
| Stage 4: Replicate OpenCLIP | Replicate | ~$0.00017/image (A40 GPU, ~0.3s) | **$0.17** |
| Stage 5: pgvector queries | Supabase | Included in Pro plan | **$0.00** |
| Blob storage (crops, 224×224 JPEG ~15KB) | Vercel Blob | $0.023/GB | **~$0.35** per 1k crops |
| Supabase rows | Supabase | Included in Pro plan | **$0.00** |
| **Total per 1,000 posts** | | | **~$1.30** |

### Monthly Projection

| Scenario | Daily Posts | Monthly Posts | Monthly Cost |
|----------|-------------|---------------|--------------|
| Conservative (500 celebs × 5 posts/day) | 2,500 | 75,000 | **~$98** |
| Moderate (+ hashtag streams) | 4,000 | 120,000 | **~$156** |
| Full scale (+ Reddit + hashtags) | 6,000 | 180,000 | **~$234** |

### Not Counted

- Base Supabase Pro plan: $25/month (fixed)
- Vercel Pro: $20/month (fixed)
- Blob storage at rest: $0.023/GB/month — at 1M crops × 15KB = 15GB ≈ $0.35/month (negligible)

### Budget Cap

Set a daily hard cap via the `ratelimit.ts` module (Upstash Redis counter):
- Default cap: 10,000 processed images/day ≈ $13/day
- Alert threshold: 80% of cap
- Circuit breaker: stop all crons when cap hit; resume at midnight UTC

---

## 13. Rate Limit + Budget Guards

### Daily Spend Cap (per cron step)

Each cron route reads and increments a Redis counter before processing each batch:

```typescript
// In @/lib/ratelimit.ts
const DAILY_BUDGET = {
  apify: 1000,         // max Apify calls per day
  gemini: 5000,        // max Gemini Vision calls per day
  replicate: 5000,     // max Replicate calls per day
  blob_writes: 10000,  // max Vercel Blob writes per day
};
```

Redis key format: `lenzy:budget:{service}:{YYYY-MM-DD}` — auto-expires at 25 hours.

### Circuit Breaker

Implemented as a Redis key `lenzy:circuit:{service}:open` with TTL = 3600s (1 hour).

```
IF budget_used >= daily_limit:
  SET lenzy:circuit:{service}:open = 1  EX 3600
  logger.warn({ service }, 'Circuit breaker opened')
  RETURN early from cron handler

IF lenzy:circuit:{service}:open EXISTS:
  logger.info({ service }, 'Circuit breaker open — skipping')
  RETURN early
```

The circuit breaker clears automatically after 1 hour, allowing work to resume in the next cron window.

### Apify-Specific Guards

- Maximum 20 concurrent Apify runs globally (enforced by Redis counter `lenzy:apify:active_runs`).
- If IG actor returns `status='TIMED_OUT'` twice in a row for the same handle, mark `directory_celebrities.scan_enabled = false` and alert.
- Per-handle backoff: exponential delay after consecutive failures (1h → 6h → 24h → disable).

### QStash DLQ

Failed Apify runs (after 3 retries with exponential backoff) are enqueued to QStash DLQ with:
```json
{
  "type": "apify_run_failed",
  "actor_id": "shu8hvrXbJbY3Eb9W",
  "input": { ... },
  "celebrity_id": 123,
  "attempt": 3,
  "error": "TIMED_OUT"
}
```

The DLQ is processed by a weekly cleanup job that either retries or marks handles as permanently failed.

---

## 14. Observability

### Structured Logging (pino)

Every cron handler uses `@/lib/logger` (pino wrapper):

```typescript
import { logger } from '@/lib/logger';

logger.info({ step: 'celeb-scan', batch: 50, processed: 47, skipped: 3 }, 'Batch complete');
logger.warn({ handle: 'zendaya', error: 'TIMED_OUT' }, 'Apify run timed out');
logger.error({ err }, 'Unhandled error in vision-detect');
```

Log fields are consistent across all crons:

| Field | Description |
|-------|-------------|
| `step` | Pipeline stage name |
| `batch_size` | Number of rows attempted |
| `processed` | Successfully processed |
| `skipped` | Skipped (already done, inactive, etc.) |
| `errors` | Count of errors in this batch |
| `duration_ms` | Wall-clock time for the batch |
| `cost_estimate` | Estimated USD spent in this run |

### Sentry

All unhandled exceptions are captured via `Sentry.captureException`. Each cron wraps its main logic in:

```typescript
try {
  // ... pipeline logic
} catch (err) {
  Sentry.captureException(err, { extra: { step, batch_size } });
  throw err;
}
```

Performance transactions are created per cron run:

```typescript
const transaction = Sentry.startTransaction({ name: `cron.${step}`, op: 'cron' });
```

### Admin Dashboard Counters

The `/admin` dashboard reads from a `cron_stats` materialized view refreshed every 5 minutes:

| Counter | Source |
|---------|--------|
| Posts ingested today | `brand_content WHERE created_at > today AND type='unattributed_photo'` |
| Vision processed today | `brand_content WHERE vision IS NOT NULL AND updated_at > today` |
| Auto-attributed today | `brand_content WHERE type='celeb_photo' AND attribution->>'auto_attributed'='true' AND updated_at > today` |
| Pending review | `brand_content WHERE attribution->>'review_status'='pending'` |
| Gemini calls today | Redis counter |
| Replicate calls today | Redis counter |
| Estimated daily spend | Computed from Redis counters × unit costs |

---

## 15. Failure Modes + Recovery

### Failure Matrix

| Failure | Detection | Impact | Recovery |
|---------|-----------|--------|---------|
| **Apify 429 Rate Limit** | HTTP 429 from Apify API | Partial batch skipped | Exponential backoff (1s, 2s, 4s). If persists, QStash DLQ. Next cron window picks up unprocessed rows via `last_scanned_at` logic. |
| **Apify TIMED_OUT** | `status='TIMED_OUT'` in run result | Handle missed for this cycle | Retry once with `memoryMbytes=1024`. Mark handle's `scan_error_count++`. After 3 consecutive failures, disable handle. |
| **Gemini Vision timeout** | HTTP 504 or SDK timeout (30s) | Row left with `vision=NULL` | Retry up to 3× with 2s, 4s backoff. Next `vision-detect` cron picks up any `vision IS NULL` rows automatically. |
| **Gemini Vision invalid JSON** | `JSON.parse` throws | Row left with `vision=NULL` | Log raw response, retry once with explicit JSON enforcement in prompt. If still fails, set `vision={'error':'parse_failed'}`. |
| **Replicate cold start** | >30s response time | Crop embedding delayed | Timeout set at 120s for Replicate (cold start can take 60s for GPU). If timeout, row stays in `crop_queue` with `embedded_at=NULL`; next `embed-crops` cron picks it up. |
| **Replicate model unavailable** | HTTP 503 | Entire embed batch blocked | Alert Sentry. Fallback: use OpenAI `text-embedding-3-small` on the vision description text (shape+color+material) as a temporary proxy embedding. |
| **Vercel Blob write fails** | Non-2xx from Blob API | Crop URL not stored | Retry 3×. If persistent, log the crop as failed in `crop_queue.error`; skip embedding for this crop. |
| **pgvector query timeout** | >5s query time | Match step blocked | `SET statement_timeout = '5s'`. If timeout, skip this embedding, flag for retry. Investigate with `EXPLAIN ANALYZE`. |
| **Supabase conn pool exhaustion** | `connection pool is full` error | All DB writes blocked | Use connection pooler (Transaction mode, PgBouncer) for cron functions. Max pool size = 10 per cron function. Implement queue depth check: if `> 5000 rows pending`, skip adding more and wait. |
| **CRON_SECRET mismatch** | HTTP 401 from route handler | Cron call rejected | Vercel automatically retries with correct header. If persists, check env var sync. |
| **Vercel function timeout (10s default)** | Function killed | Partial batch written | Cron handlers are designed for batches of 50 rows. Each step should complete in <8s for 50 rows. If a single Gemini call is slow, the row is left for the next cron window. Functions are idempotent. |
| **Disk / memory OOM during crop** | sharp throws OOM | Individual crop fails | Catch per-crop, log, mark `crop_queue.error='oom'`, continue to next crop. |

### Recovery Runbook

**After any pipeline stoppage:**

1. Check Sentry for recent errors — identify which stage failed.
2. Check Redis circuit breakers: `GET lenzy:circuit:*:open` — clear manually if needed.
3. The pipeline is fully idempotent: re-running any cron will pick up where it left off.
   - `celeb-scan`: re-scans handles where `last_scanned_at < now() - interval`.
   - `vision-detect`: picks up `brand_content WHERE vision IS NULL AND is_active = true`.
   - `crop-and-blob`: picks up `brand_content WHERE vision->>'eyewear_present'='true' AND id NOT IN (SELECT brand_content_id FROM crop_queue)`.
   - `embed-crops`: picks up `crop_queue WHERE embedded_at IS NULL`.
   - `match-products`: picks up `celeb_photo_embeddings WHERE (SELECT matched_at FROM crop_queue WHERE id=crop_queue_id) IS NULL`.
4. For large backlogs (>10k rows), increase cron batch sizes temporarily: set `CRON_BATCH_SIZE=200` env var.
5. For Gemini API quota issues: check Google Cloud Console quotas; request increase for `gemini-2.0-flash-exp` RPM.

---

*End of VISION_PIPELINE.md*
