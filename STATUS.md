# Lenzy Rebuild Status

**Last updated:** Phases 1–3 shipped, Phase 4 vision pipeline scaffolded. Autonomous overnight run.

## What shipped tonight

### Phase 1 · Foundations (DONE)

**Security**
- [x] Killed every hardcoded base64 API-key fallback (`GEMINI`, `REPLICATE`).
- [x] Centralized env var access in `src/lib/env.ts` with fail-fast `required()`.

**Schema (live on Supabase prod `adrisbzrtlkoeqmzkbsz`)**
- [x] `pgvector` + `pg_trgm` extensions enabled.
- [x] FK constraint: `brand_content.brand_id` → `tracked_brands.id` `ON DELETE CASCADE`.
- [x] Unique constraint: `(brand_id, type, source, source_ref)` for idempotent upserts.
- [x] Legacy tables renamed: `ig_posts` → `ig_posts_legacy`, `products` → `products_legacy`, `celeb_photos` → `celeb_photos_legacy`. Drop in 14 days.
- [x] New tables: `users` (role + `workspace_id`), `watchlist`, `boards`, `board_items`, `comments`, `audit_log` (auto-populated via triggers on `tracked_brands` + `directory_people`), `saved_searches`, `alerts`, `product_embeddings`, `person_embeddings` (HNSW indexes).
- [x] RPC function: `product_similarity_search(query_embedding, match_count)`.

**Design system**
- [x] CSS tokens in `globals.css` — light + dark themes, accent deep optical-blue.
- [x] Inter-only typography, tabular numerals, 14px body.
- [x] Spacing scale 4/8/12/16/24/32/48/64.
- [x] Motion 150ms in / 100ms out, respects `prefers-reduced-motion`.
- [x] Density toggle `[data-density="dense"]`, persisted in localStorage.

**UI primitives** (`src/components/ui/`)
- [x] `Button`, `Card`, `CardHeader`, `CardTitle`, `CardSubtitle`
- [x] `Badge`, `Chip`, `Input`, `Textarea`, `Select`
- [x] `Dialog` + `Drawer` (same primitive, different mount)
- [x] `Skeleton`, `EmptyState`
- [x] `MediaCard` (photo-first, used across Feed/Products/Celebs/Reimagines/Posts)
- [x] `Table` + helpers, `Timeline`

**Global shell** (`src/components/layout/`)
- [x] Top bar: Lenzy wordmark · search trigger · density toggle · avatar
- [x] Left rail: 8 modules, collapsible on ⌘B, persistent
- [x] Mobile bottom nav, 5 primary items
- [x] `CommandPalette` (⌘K) — cross-entity search with actions
- [x] Keyboard: ⌘K palette · ⌘B rail · ⌘D density · ESC close

**Observability + API primitives**
- [x] `src/lib/logger.ts` — pino structured logs (JSON in prod, pretty in dev)
- [x] `src/lib/sentry.ts` — scaffold, activates when `SENTRY_DSN` set
- [x] `src/lib/ratelimit.ts` — Upstash Redis, fails open without creds
- [x] `src/lib/api.ts` — `withHandler`, `ok`, `fail`, `validateQuery`, `validateBody`
- [x] `src/lib/embeddings/openai.ts` — text-embedding-3-small client, batched

### Phase 2 · Auth + Users (SCHEMA-ONLY, UI pending)
- [x] `users` table with role + `workspace_id` for multi-tenant future
- [x] `watchlist`, `boards`, `board_items`, `audit_log` tables
- [x] Audit-log triggers on `tracked_brands` + `directory_people`
- [ ] Supabase Auth Google OAuth wire-up (needs `GOOGLE_OAUTH_CLIENT_ID/SECRET` from user)
- [ ] Middleware role enforcement (pending env setup)
- [ ] `/signin` branded page (using existing signin for now)

### Phase 3 · Brand deep-dive (DONE)
- [x] `/brands/[id]` route with 9 tabs: Overview · Posts · Products · People · Celebs · Reimagines · Links · News · Compare
- [x] `BrandHeader`, `BrandTabs`, `BrandOverview` (timeline + at-a-glance + socials + competitors)
- [x] `BrandPosts`, `BrandProducts`, `BrandPeople`, `BrandNews`, `BrandDetailClient`
- [x] Mobile-responsive.

### Phase 3.5 · New app shell + all modules (DONE)
- [x] `/` → redirect to `/feed`
- [x] `/feed` — new Feed with Shell + search/sort/category chips
- [x] `/brands` — Directory with table + gallery views
- [x] `/brands/[id]` — 9-tab deep-dive (see above)
- [x] `/people` — People directory with brand_id chips
- [x] `/products` — Catalog with brand-picker
- [x] `/celebrities` — Vision-filtered celeb feed
- [x] `/trends` — Region tabs + Weekly Must-Do
- [x] `/content` — Unified brand_content browser
- [x] `/boards` — Swipe files (client-side today, DB-backed in Phase 2 rollout)
- [x] `/studio` — Reimagine Studio v2 (source picker + brand kit + results)
- [x] `/admin` — Stats + cron schedule
- [x] Legacy redirects: `/intel` → `/brands`, `/news` → `/feed`, `/watchlist`, `/sources`, `/ads` → `/feed`

### v1 API (DONE)
- [x] `GET /api/v1/search` — unified cross-entity search (powers ⌘K)
- [x] `GET /api/v1/brands/profile?id=N` — full per-brand payload
- [x] `GET /api/v1/brands/compare?ids=A,B,C` — side-by-side
- [x] `GET /api/v1/brands/news?id=N` — Gemini-generated weekly brief (7-day cache)
- [x] `GET /api/v1/similar?id=N|q=text` — pgvector similarity
- [x] `GET /api/v1/embeddings/backfill?key=…` — product text-embedding backfill
- All use: Zod validation, pino logging, `withHandler` wrapper

### Cron repointing (DONE)
- [x] `src/lib/feed-db.ts` `upsertPosts()` now writes to `brand_content` (not `ig_posts_legacy`)
- [x] `/api/cron/rescrape` dedup reads from `brand_content` (type=`ig_post`)
- [x] Old ig_posts writers no longer touching legacy tables

### Deleted
- [x] `src/app/[[...slug]]/page.tsx` (4,770-line monolith) — all extracted into `features/` + routed properly

### Phase 4 · Vision moat (SCAFFOLDED)
- [x] `src/lib/vision/detect.ts` — Gemini Vision eyewear detector (structured JSON, 3-model fallback)
- [x] `src/lib/auth/session.ts` — Supabase session + role guards + email allowlist
- [x] `POST /api/v1/attribute` — unbranded photo → text embed → pgvector match → optional persist @ ≥ 0.75 confidence
- [x] `GET/POST /api/v1/review-queue` — list + approve/reject for 0.5–0.75 bucket
- [x] `/admin/review` — Review Queue UI (approve candidate brand from top-3, approve as-is, reject)
- [x] `GET /api/v1/brands` — Zod-validated brands list with content counts
- [x] `GET /api/v1/content` — Zod-validated content feed
- [x] `POST/PUT /api/v1/brands/create` — Zod-validated upsert for tracked_brands

Still pending for Phase 4 production:
1. OpenCLIP image embeddings (needs `OPENAI_API_KEY`)
2. 52k-image backfill cron (~$30–60 one-time)
3. Reddit / Pinterest / IG hashtag scrapers
4. Monthly backtest harness

## What needs user input

Before Phase 4/5 can ship:

1. **Env vars on Vercel** (Phase 1 can run without, but hardcoded key fallbacks are gone so Gemini/Replicate need real envs):
   ```
   GEMINI_API_KEY
   REPLICATE_API_TOKEN
   OPENAI_API_KEY          (for embeddings backfill)
   SENTRY_DSN              (activates Sentry)
   RESEND_API_KEY          (for Phase 5 digest)
   UPSTASH_REDIS_REST_URL  (activates rate limiting)
   UPSTASH_REDIS_REST_TOKEN
   QSTASH_TOKEN            (Phase 5 DLQ)
   GOOGLE_OAUTH_CLIENT_ID  (Phase 2 auth)
   GOOGLE_OAUTH_CLIENT_SECRET
   LENZY_ALLOWED_EMAILS    (e.g. *@lenskart.com)
   ```

2. **Paid API sign-off** (monthly):
   - Current: Apify $199 + Gemini/Replicate pay-as-you-go + Supabase $25 + Vercel Pro $20 ≈ $250
   - + Production grade: Sentry $26 + Upstash $20 + OpenAI embeddings $10 + Resend $0–20 ≈ $325–375
   - + Enrichment (Phase 5): Crunchbase $49 + SimilarWeb $199 + Meta (free) ≈ $575

3. **Meta Business verification** — start the application now so Ad Library is unlocked by Phase 5.

## How to verify the rebuild live

Once Vercel deploys this:
- `lenzi.studio/` → redirects to `/feed`
- `lenzi.studio/feed` → new Feed with Shell, ⌘K palette, density toggle
- `lenzi.studio/brands` → table+gallery directory, 3,500+ brands
- `lenzi.studio/brands/142` → Ray-Ban's 9-tab deep-dive page
- `lenzi.studio/brands/37` → Warby Parker
- `lenzi.studio/brands/343` → Retrosuperfuture (largest catalog, 3,393 rows)
- `lenzi.studio/content` → 163k unified content rows with type chips
- `lenzi.studio/studio` → Reimagine Studio v2
- `lenzi.studio/admin` → System stats + cron schedule
- Press ⌘K anywhere to open the command palette.

## Known not-yet-done

- Auth flows wait on `GOOGLE_OAUTH_CLIENT_ID` from user
- Sentry errors silent until `SENTRY_DSN` set
- Rate limiting bypasses until `UPSTASH_REDIS_REST_URL` set
- The Boards page uses localStorage today; swap to `boards` + `board_items` table in Phase 2 rollout
- Reimagine Studio v2 at `/studio` coexists with the old `/reimagine` (both work — one is new Shell, one is standalone)
