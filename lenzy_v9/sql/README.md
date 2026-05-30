# Lenzy v2 — Postgres Migration SQL

Production-grade migrations for Lenzy v2 on Supabase Postgres Pro.
Requires: **pgvector**, **pg_trgm**, **uuid-ossp**, **pgcrypto** (all installed by `0001`).

---

## Migration files

| File | Description |
|------|-------------|
| `0001_extensions_and_helpers.sql` | Extensions + helper functions (`set_updated_at`, `slugify`, `audit_log_trigger_fn`) |
| `0002_tracked_brands.sql` | Master brand directory (3,000+ rows) |
| `0003_directory_people.sql` | Eyewear-industry professionals |
| `0004_directory_celebrities.sql` | Celebrity / influencer table (vision moat) |
| `0005_brand_content.sql` | Polymorphic content table (IG posts, products, reimagines, …) |
| `0006_products.sql` | Structured product catalog |
| `0007_embeddings.sql` | pgvector tables (`product_embeddings`, `celeb_photo_embeddings`) |
| `0008_users_auth.sql` | User profiles + Supabase Auth integration |
| `0009_workflow.sql` | Watchlist, boards, board_items, comments, saved_searches, alerts |
| `0010_audit_log.sql` | Audit log table + triggers on core tables |
| `0011_cron_runs.sql` | Cron run log (`feed_cron_runs`) |
| `0020_rls_policies.sql` | Row-Level Security policies for all user-facing tables |
| `0030_seed_from_v9.sql` | Seed instructions for v9 CSV data |
| `0040_review_queue.sql` | `mv_editor_review_queue` materialized view |

**Apply in numeric order.** Each file depends on the previous ones.

---

## How to apply

### Option 1 — Supabase CLI (recommended)

```bash
# Set your connection string
export DATABASE_URL="postgresql://postgres.<project-ref>@aws-0-<region>.pooler.supabase.com:5432/postgres"

# Apply all migrations in order
for f in $(ls sql/0*.sql | sort); do
  echo "Applying $f..."
  psql "$DATABASE_URL" -f "$f"
done
```

Or use the Supabase migrations directory:

```bash
# Copy files into supabase/migrations/ and run:
supabase db push
```

### Option 2 — psql directly (one file at a time)

```bash
psql "$DATABASE_URL" -f sql/0001_extensions_and_helpers.sql
psql "$DATABASE_URL" -f sql/0002_tracked_brands.sql
# … and so on in numeric order
```

### Option 3 — Supabase Dashboard SQL Editor

Open each file and paste the contents into the SQL editor.
Run files **in numeric order**.

> **Note on `0030_seed_from_v9.sql`:** Supabase's SQL Editor does not support
> `\copy` (a psql client command). Use the **Dashboard → Table Editor → Import CSV**
> UI, or run the `\copy` commands from a local psql session connected to your
> Supabase project's direct connection string.

---

## Required environment variables

```env
# Supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>      # server-side only, never expose

# Database (direct connection for migrations)
DATABASE_URL=postgresql://postgres.<project-ref>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Auth
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
LENZY_ALLOWED_EMAILS=*@lenskart.com               # comma-separated or glob

# AI / ML
OPENAI_API_KEY=...                                # text-embedding-3-small
GEMINI_API_KEY=...                                # vision detection
REPLICATE_API_TOKEN=...                           # FLUX + OpenCLIP

# Scraping
APIFY_TOKEN=...

# Storage
BLOB_READ_WRITE_TOKEN=...                         # Vercel Blob

# Observability
SENTRY_DSN=...

# Email
RESEND_API_KEY=...

# Cron security
CRON_SECRET=<random-32-char>

# Cache + rate-limit
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
QSTASH_TOKEN=...
```

---

## Rollback guide

Each migration file contains a `-- ROLLBACK:` comment at the top with the exact
`DROP` statements needed to reverse it.

**Reverse the migrations in reverse numeric order:**

```sql
-- Rollback 0040
DROP MATERIALIZED VIEW IF EXISTS mv_editor_review_queue;
DROP FUNCTION IF EXISTS refresh_review_queue();

-- Rollback 0030
-- (no DDL — only DML; to undo: TRUNCATE tracked_brands, directory_celebrities)

-- Rollback 0020
-- For each table, run:
--   ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
-- Then drop each named policy (policy names are in the file).

-- Rollback 0011
DROP TABLE IF EXISTS feed_cron_runs CASCADE;

-- Rollback 0010
DROP TRIGGER IF EXISTS trg_audit_tracked_brands ON tracked_brands;
DROP TRIGGER IF EXISTS trg_audit_directory_people ON directory_people;
DROP TRIGGER IF EXISTS trg_audit_directory_celebrities ON directory_celebrities;
DROP TRIGGER IF EXISTS trg_audit_brand_content ON brand_content;
DROP TABLE IF EXISTS audit_log CASCADE;

-- Rollback 0009
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS saved_searches CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS board_items CASCADE;
DROP TABLE IF EXISTS boards CASCADE;
DROP TABLE IF EXISTS watchlist CASCADE;

-- Rollback 0008
DROP TRIGGER IF EXISTS trg_auth_users_on_create ON auth.users;
DROP TABLE IF EXISTS users CASCADE;

-- Rollback 0007
DROP TABLE IF EXISTS celeb_photo_embeddings CASCADE;
DROP TABLE IF EXISTS product_embeddings CASCADE;

-- Rollback 0006
DROP TABLE IF EXISTS products CASCADE;

-- Rollback 0005
DROP TABLE IF EXISTS brand_content CASCADE;

-- Rollback 0004
DROP TABLE IF EXISTS directory_celebrities CASCADE;

-- Rollback 0003
DROP TABLE IF EXISTS directory_people CASCADE;

-- Rollback 0002
DROP TABLE IF EXISTS tracked_brands CASCADE;

-- Rollback 0001 (only if no tables remain — extensions may be shared)
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS slugify(text) CASCADE;
DROP FUNCTION IF EXISTS audit_log_trigger_fn() CASCADE;
-- Do NOT drop extensions in production without confirming no other dependents.
```

---

## Schema overview

```
auth.users (Supabase managed)
    └── users (0008)          ← profile + role

tracked_brands (0002)
    ├── brand_content (0005)  ← all content (IG posts, products, celebs, ...)
    │       ├── .celebrity_id → directory_celebrities (0004)
    │       ├── .person_id    → directory_people (0003)
    │       └── .parent_id    → brand_content (self-ref, reimagines)
    ├── products (0006)
    │       └── product_embeddings (0007) ← pgvector 1536+512
    └── directory_people (0003)
            └── .current_company_id → tracked_brands

directory_celebrities (0004)
    └── celeb_photo_embeddings (0007) ← pgvector 512

users (0008)
    ├── watchlist (0009)      → tracked_brands
    ├── boards (0009)
    │       └── board_items   → brand_content
    ├── comments (0009)       (polymorphic target)
    ├── saved_searches (0009)
    └── alerts (0009)

audit_log (0010) ← auto-populated by triggers on core tables
feed_cron_runs (0011) ← written by background cron jobs

mv_editor_review_queue (0040) ← materialized view over brand_content
```

---

## pgvector notes

- `product_embeddings.text_embedding` — `vector(1536)` — OpenAI text-embedding-3-small
- `product_embeddings.image_embedding` — `vector(512)` — OpenCLIP
- `celeb_photo_embeddings.embedding` — `vector(512)` — OpenCLIP (eyewear crop)
- All HNSW indexes: `m=16, ef_construction=64` — good for up to ~5M rows
- At query time, set `SET hnsw.ef_search = 100` for higher recall
- If row count exceeds 5M, partition by `type` or migrate to Pinecone

---

## RLS summary

| Table | anon | authenticated | editor | admin |
|-------|------|---------------|--------|-------|
| tracked_brands | read (active only) | read all | + write | + delete |
| brand_content | read (active only) | read all | + write | + delete |
| directory_celebrities | read | read | + write | + delete |
| directory_people | read | read | + write | + delete |
| products | read | read | + write | — |
| product_embeddings | — | read | — | — |
| celeb_photo_embeddings | — | read | — | — |
| users | — | own row | — | all |
| watchlist | — | own rows | — | — |
| boards | — | own + shared | — | — |
| board_items | — | own boards | — | — |
| comments | — | read all + own write | — | + delete |
| saved_searches | — | own rows | — | — |
| alerts | — | own rows | — | read all |
| audit_log | — | — | — | read all |
| feed_cron_runs | — | — | — | read all |

**service_role bypasses RLS entirely** — used by server-side Next.js routes,
cron jobs, and the vision pipeline.

---

## Seeding

After applying migrations, seed the brand and celebrity data:

```bash
# 1. Connect to Supabase with psql
PGPASSWORD=<password> psql \
  "postgresql://postgres.<ref>@aws-0-<region>.pooler.supabase.com:5432/postgres"

# 2. Load brands
\copy tracked_brands (handle, name, country, iso_alpha2, iso_alpha3, region, \
  hq_city, category, subcategory, business_type, business_model, price_tier, \
  founded_year, ownership_type, is_public, stock_ticker, website, \
  instagram_url, linkedin_url, facebook_url, youtube_url, tiktok_url, \
  instagram_followers, employee_estimate, store_estimate, revenue_usd_estimate, \
  naics_code, sic_code, is_d2c, is_manufacturer, is_retailer, is_luxury, \
  is_smart_eyewear, has_manufacturing, sustainability_focus, description, tags, \
  completeness_pct, confidence_pct, needs_reverification) \
FROM '/path/to/lenzy_v9/data/companies_v9_tracked_brands.csv' \
WITH (FORMAT csv, HEADER true, NULL '');

# 3. Load celebrities (once celebrities_v9.csv exists)
\copy directory_celebrities (name, aliases, slug, region, country, iso_alpha2, \
  category, gender, instagram_handle, instagram_url, instagram_followers_estimate, \
  instagram_verified, twitter_handle, tiktok_handle, youtube_handle, \
  eyewear_affinity, known_eyewear_brands, glasses_notes, lenskart_relevance, \
  scan_enabled, scan_frequency_hours, data_quality, provenance) \
FROM '/path/to/lenzy_v9/data/celebrities_v9.csv' \
WITH (FORMAT csv, HEADER true, NULL '');
```

See `0030_seed_from_v9.sql` for the full walkthrough, including post-seed
verification queries.
