# Lenzy — Production Rebuild Plan

8 weeks, 6 phases. Each phase is a discrete shippable improvement that can be reviewed before the next starts.

---

## Phase 1 · Foundations (week 1–2)

**Goal:** make the codebase production-shaped without changing what users see.

### Engineering tasks

1. **Split `page.tsx` (4,770 lines) into feature folders**
   ```
   src/features/
     ├─ feed/          (Feed tab + MediaCard + ListCarousel)
     ├─ news/          (News + VisualTrends)
     ├─ celebrities/   (Celebs feed + scanner)
     ├─ intel/
     │   ├─ brands/    (BrandsManager + EditDialog)
     │   ├─ people/    (PeopleDirectory)
     │   ├─ products/  (ProductCatalog)
     │   └─ content/   (ContentDirectory)
     ├─ products/      (Shop tab feed)
     ├─ boards/
     ├─ watchlist/
     └─ reimagine/
   ```

2. **Extract design system primitives**
   ```
   src/components/ui/
     ├─ Button.tsx
     ├─ Card.tsx
     ├─ Dialog.tsx
     ├─ Input.tsx
     ├─ Select.tsx
     ├─ Table.tsx
     ├─ Badge.tsx
     ├─ Skeleton.tsx
     └─ EmptyState.tsx
   ```
   All using Tailwind + CSS variables already in `globals.css`. No more inline class soup.

3. **Add Zod validation on every API route**
   - One schema file per route under `src/app/api/{route}/schema.ts`
   - Validate query + body before any DB call
   - Return 400 with structured error on validation failure

4. **Delete hardcoded API key fallbacks**
   - Remove `GEMINI_API_KEY` base64 default from every route
   - Remove `REPLICATE_API_TOKEN` base64 default
   - Require env var to be set, fail fast if missing

5. **Supabase RLS + service-role server client**
   - Enable RLS on `tracked_brands`, `brand_content`, `directory_people`, all logs
   - Define policies: `auth.uid()` IS NOT NULL for SELECT, `service_role` for INSERT/UPDATE/DELETE
   - Server routes use `SUPABASE_SERVICE_ROLE_KEY`, client uses anon key with RLS

6. **FK constraints + drop legacy tables**
   - `ALTER TABLE brand_content ADD FOREIGN KEY (brand_id) REFERENCES tracked_brands(id) ON DELETE CASCADE`
   - Migrate any cron writers still hitting `ig_posts` / `products` / `celeb_photos` to `brand_content`
   - Drop the legacy 3 tables

7. **Sentry + structured logging**
   - `npm install @sentry/nextjs pino pino-pretty`
   - Wrap `error.tsx`, `global-error.tsx`
   - Replace every `console.log` with `logger.info` / `logger.error`

8. **Tests**
   - Vitest for utility functions in `src/lib/`
   - Playwright e2e for: open Feed, search, open brand page, generate reimagine
   - GitHub Actions workflow runs both on every PR

### Deliverable

The app looks identical to the user but the code is structured for the next 12 months of development.

---

## Phase 2 · Auth + Users (week 3)

**Goal:** real login, real users, per-user data.

### Engineering tasks

1. **Supabase Auth via Google OAuth**
   - Use Supabase's built-in Google provider
   - Restrict to `@lenskart.com` + invited emails
   - Replace the HMAC-cookie hack with Supabase session cookies

2. **Users table**
   ```sql
   CREATE TABLE users (
     id uuid PRIMARY KEY REFERENCES auth.users(id),
     email text UNIQUE NOT NULL,
     name text,
     picture text,
     role text NOT NULL DEFAULT 'viewer',  -- admin / editor / viewer
     last_seen_at timestamptz,
     created_at timestamptz DEFAULT now()
   );
   ```

3. **Role-based access control**
   - Middleware checks role for write endpoints (Editor+ for /api/brands/create, Admin for /api/users)
   - UI hides edit buttons for Viewers

4. **Per-user Watchlist + Boards (move from localStorage to DB)**
   ```sql
   CREATE TABLE watchlist (id, user_id, brand_id, added_at);
   CREATE TABLE boards (id, user_id, name, description, is_shared, created_at);
   CREATE TABLE board_items (id, board_id, content_id, note, added_at);
   ```

5. **Audit log table**
   ```sql
   CREATE TABLE audit_log (
     id bigserial PK, user_id uuid, action text,
     entity_type text, entity_id bigint,
     before jsonb, after jsonb, at timestamptz DEFAULT now()
   );
   ```
   Auto-populated via Postgres triggers on `tracked_brands`, `directory_people`, `brand_content`.

6. **`/signin` redesigned** — clean Google button, allowlist messaging if rejected, branded feel.

### Deliverable

Lenzy is a real internal tool. 10 Lenskart team members can log in, each has their own watchlist and boards, every change is audit-logged.

---

## Phase 3 · Brand Detail Pages (week 4)

**Goal:** ship the most-requested missing feature.

See `03_BRAND_PAGE.md` for full spec.

### Tasks

1. New route `/brands/[id]` and `/brands/[handle]` (alias)
2. New endpoint `/api/brands/profile?id=N` returns brand + nested counts
3. 9 tabs: Overview / Posts / Products / People / Celebs / Reimagines / Links / News / Comparison
4. Edit drawer for Editor+ role
5. AI brand brief endpoint `/api/brands/news?id=N` (Gemini-generated, 7-day cache)
6. Comparison endpoint `/api/brands/compare?ids=A,B,C`
7. Mobile-responsive layout (timeline first on mobile)

### Deliverable

A team member can click any brand and see *everything* — posts, products, people, celebs spotted, reimagines, news, comparison — in one page.

---

## Phase 4 · Unbranded Detection + Embedding Search (week 5–6)

**Goal:** the strategic moat — detecting eyewear in any photo, even unbranded, and matching to our catalog.

### Tasks

1. **Install pgvector**
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE TABLE product_embeddings (...);
   CREATE TABLE person_embeddings (...);
   ```

2. **Embed all 52k products + 1.5k people**
   - OpenAI `text-embedding-3-small` (1536 dims) on `name + description + tags`
   - Backfill via batched cron, then incremental on insert/update
   - Index: HNSW for fast nearest-neighbor

3. **Image embedding for unbranded eyewear matching**
   - Use OpenCLIP or Cohere multimodal to embed product images
   - At Vision detection time: embed the detected eyewear region → similarity search → top-5 matching products → attribute to that brand with confidence score

4. **New scrapers writing to `brand_content`**
   - Reddit (r/glasses, r/sunglasses, r/eyewear) — daily Apify cron
   - Pinterest eyewear hashtags — weekly
   - Instagram hashtag streams (#sunglasses #eyewearfashion etc) — daily

5. **Vision pipeline for unbranded photos**
   - For each unbranded photo: Gemini Vision detects faces + eyewear
   - Crop eyewear region → embed → similarity match against product_embeddings
   - If confidence > 0.7 → write `brand_content` row with `data.attribution_confidence`
   - Else → write as unattributed celeb_photo for human review

6. **Review queue** — Editor UI to confirm/reject low-confidence attributions

### Deliverable

When Selena Gomez wears a frame in a paparazzi shot, Lenzy detects it, matches to closest product across all 52k SKUs, and tags the brand — automatically.

---

## Phase 5 · Intelligence Features (week 7)

**Goal:** add the data sources and notifications that make Lenzy a daily-use product.

### Tasks

1. **Meta Ad Library integration** (needs Business verification first)
   - `/api/cron/meta-ads` weekly scrape
   - Writes to `brand_content` type=`ad`
   - Surface on brand detail page

2. **Crunchbase + SimilarWeb enrichment**
   - On brand save: enqueue background job
   - Crunchbase: funding rounds, employee count, founding date
   - SimilarWeb: monthly traffic estimate
   - Update `tracked_brands` fields automatically

3. **Daily email digest via Resend**
   - Top 5 posts of the day
   - 3 trends moving this week
   - 2 people who recently moved
   - 1 brand spotlight
   - Sent every weekday 9am IST

4. **"People who recently moved" feed**
   - Detect title/company changes via weekly LinkedIn cron
   - Surface on Intel → People tab
   - Email opt-in for hiring team

5. **LinkedIn weekly sync**
   - For each person with `linkedin_url`, re-scrape monthly
   - Detect changes, update `directory_people`, log to audit

6. **Saved searches with alerts**
   - "Amber acetate frames in EU under €200" — save filter combo
   - When 3+ new posts/products match → email + in-app notification

### Deliverable

Lenzy becomes a daily-open tool. Team gets value passively via emails + alerts, not just when they actively search.

---

## Phase 6 · Polish + Scale (week 8)

**Goal:** make it feel like a Stripe-quality product.

### Tasks

1. **Design system pass across every tab**
   - All 12 tabs use the primitive components from Phase 1
   - Consistent spacing, color, typography
   - Dark mode polish (currently inconsistent)

2. **a11y baseline**
   - All images have alt text
   - All buttons have ARIA labels
   - All forms have proper labels + error messaging
   - Focus states visible
   - Keyboard navigation works in feed (arrow keys), brand page (tabs), command palette

3. **Loading skeletons + empty states**
   - No more "Loading..." spinners
   - Skeleton matches actual content shape
   - Empty states with helpful CTAs ("No brands match — try removing a filter")

4. **Edge caching**
   - `/api/feed`, `/api/content`, `/api/brands/tracked` cached at edge for 60s
   - Bust cache on mutations

5. **Image pipeline**
   - Move from `/api/img` proxy to Vercel Image Optimization
   - Auto-WebP, responsive sizes, lazy loading

6. **Onboarding tour** for first-time users
   - Highlight key tabs, show how to add a brand, demo Reimagine

7. **Admin dashboard**
   - Usage metrics (DAU/MAU, top features, top brands viewed)
   - Cron health (last run, success rate, average duration)
   - Cost monitoring (Apify/Gemini/Replicate spend)
   - Data quality (completeness % distribution, broken images, dead URLs)

8. **Documentation**
   - README for the codebase
   - API docs (auto-generated from Zod schemas)
   - Runbook for ops (cron failures, restoring backups)
   - User guide (Notion or Mintlify)

### Deliverable

Production-grade tool. Lenskart team uses it daily. External team would pay for it. Optional: spin out as SaaS in Year 2.

---

## What "done" looks like at each phase

| Phase | Success criterion |
|---|---|
| 1 | Tests run on PR. No regressions. Sentry catching real errors. |
| 2 | 10 Lenskart team members logged in. Watchlist + audit log working. |
| 3 | Open any brand → see complete profile. Comparison view works. |
| 4 | Vision detects eyewear in 10 random unbranded photos and attributes correctly to brand for 7+ of them. |
| 5 | Daily digest goes out reliably. 3+ alerts triggered per week per active user. |
| 6 | Mobile experience is as good as desktop. Onboarding tour completion >70%. |

## Total timeline

**8 weeks of focused work** assuming:
- Phases ship sequentially, not in parallel
- 1 review cycle per phase (1–2 days for user feedback before next phase starts)
- No major scope changes mid-phase

Realistic delivery: **9–10 calendar weeks** with reviews + minor pivots.

## What I need from the user before starting Phase 1

1. **Sign-off on this plan** — redline anything you want changed
2. **Budget approval** — $400–700/mo for production-grade APIs
3. **Provide env vars** — Sentry DSN, Resend key, Upstash creds, OpenAI key, Google OAuth client
4. **List of allowed emails** for the user allowlist
5. **Decide:** is this single-tenant Lenskart-only forever, or should I design for multi-tenant from day one?
