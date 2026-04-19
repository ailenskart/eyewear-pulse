# Lenzy Backlog

Anything that comes up mid-phase goes here, never into the active phase. Phases ship sequentially.

## Phase 4 — The Vision moat (pending)

- [ ] Install OpenCLIP wrapper (Replicate model `cjwbw/clip-vit-large-patch14`) for image embeddings
- [ ] Image-embedding backfill job for 52k product images
- [ ] Eyewear-detection pipeline: Gemini Vision per-image → crop eyewear region → embed → pgvector match
- [ ] Review Queue UI for 0.5–0.75 confidence matches (Editor+ role)
- [ ] Backtest harness: 50 known-attributed paparazzi shots, report precision + recall monthly
- [ ] New scrapers → `brand_content`:
  - [ ] Reddit (r/glasses, r/sunglasses, r/eyewear) — daily Apify
  - [ ] Pinterest hashtag streams — weekly
  - [ ] Instagram hashtag streams (#sunglasses, #eyewearfashion, #specsstyle) — daily
- [ ] `unattributed_photo` type in brand_content for items below 0.5 confidence

## Phase 5 — Intelligence push (pending)

- [ ] Meta Ad Library integration (start Business verification in Phase 1)
- [ ] Crunchbase enrichment cron (weekly brand update)
- [ ] SimilarWeb enrichment cron
- [ ] Daily digest email via Resend (top posts + trends + people moves + brand spotlight)
- [ ] "Recently moved" feed for hiring intel
- [ ] LinkedIn weekly sync via Apify (`apify/linkedin-profile-scraper`)
- [ ] Saved searches with email + in-app alerts
- [ ] Slack webhook for brand/post/reimagine sharing

## Phase 6 — Polish (pending)

- [ ] a11y audit: alt text, ARIA, focus states, keyboard nav
- [ ] Onboarding tour for first-time users (role-aware)
- [ ] Admin cost dashboard with per-cron budget alerts
- [ ] Edge caching on `/api/v1/feed`, `/api/v1/content` (60s TTL, bust on mutations)
- [ ] Move `/api/img` proxy → Vercel Image Optimization
- [ ] Docs: auto-gen OpenAPI from Zod schemas
- [ ] User guide (Notion or Mintlify)

## Migration debt

- [ ] Delete `ig_posts_legacy`, `products_legacy`, `celeb_photos_legacy` tables (wait 14 days from Phase 1 merge)
- [ ] Add Zod validation to `/api/brands/create`, `/api/brands/upload`, `/api/people` (schemas exist in `src/schemas/`, just need to wire)
- [ ] Replace every remaining `console.log` with `logger.*` (a few still in feed-db.ts, img proxy)
- [ ] Sentry DSN + `@sentry/nextjs` install when ready to activate
- [ ] Middleware: enforce role-based auth on write endpoints when `users` table is populated

## Observed but not blocking

- [ ] Warning: "middleware" file convention deprecated in Next 16 — rename to proxy.ts when we touch it
- [ ] `src/app/[[...slug]]/page.tsx` (4,770 lines) removed in Phase 1 — the old monolith lives in git history at commit `b6701a1` if we ever need to recover a component
- [ ] Some deprecated routes under `/api/` (reddit, youtube, tiktok, brave, etc.) are still dead code — delete when touching that corner

## New ideas (not planned yet)

- [ ] Feed "for you" — personalized feed based on watchlist + board contents (implicit signals)
- [ ] Brand scoreboard — leaderboard ranking by weekly engagement growth
- [ ] Product hunt — "newest SKUs across the industry" stream
- [ ] Smart glasses category page (Ray-Ban Meta, Spectacles, etc. — standalone surface)
- [ ] Store-opening tracker (scrape brand newsrooms for location news)
- [ ] Price-history alerts per product (build on `price_history` table that's empty today)
- [ ] Competitor diff view: "What changed at Warby Parker this month?"
