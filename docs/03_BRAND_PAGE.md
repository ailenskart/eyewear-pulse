# Lenzy — Per-Brand Deep Dive Page

The single most important UX gap today. Brands only show up as table rows in the directory. There's no dedicated page where you can see *everything* about one brand.

## Route

`/brands/[id]` — primary canonical URL
`/brands/[handle]` — alias (redirects to canonical)

## Page anatomy

### Header (fixed, above the fold)

- **Logo** (from `tracked_brands.logo_url` or favicon fallback)
- **Brand name** (large, bold)
- **Brand ID chip** — `#142`
- **IG handle** — `@rayban` (clickable to IG)
- **Category + Region + Country** badges
- **Quick stats row** — followers, employees, stores, founded year, ownership type
- **Status flags** — Public / Private · Manufacturer · D2C · Smart Eyewear · Sustainability
- **Action buttons:** ⭐ Watch · ⚙ Edit · ↓ Export full · 🔍 Scan now

### Description bar

One-line: "Italian luxury house. Eyewear produced by EssilorLuxottica."

Tags shown as chips.

### Tabs (within the brand page)

1. **Overview** — the default landing tab
2. **Posts** — IG / TikTok / YouTube content
3. **Products** — full SKU catalog with price + images
4. **People** — leadership + recently added
5. **Celebs** — celebs spotted wearing this brand
6. **Reimagines** — Lenskart-branded variants generated from this brand's posts
7. **Links** — every URL we have for them (sitemaps, blogs, press, other)
8. **News** — auto-generated AI brief on what's happening with them
9. **Comparison** — "Compare to..." picker, shows side-by-side metrics

---

## Tab 1 · Overview (default)

Two-column layout:

### Left column (60%)

**Timeline** — chronological merge of:
- IG posts (last 30 days, top 10 by engagement)
- New product launches (last 30 days)
- People joining/leaving (LinkedIn change detection)
- News mentions (Brave + sitemap blog scrape)
- Reimagine generations our team made

Each timeline entry has icon + type + title + when + click-through.

### Right column (40%)

**At a glance:**
- Founded · HQ city · Country (with flag)
- Parent company (clickable → that brand's page)
- Subsidiaries (if luxury group)
- Competitors (3 closest by category + region)
- All social links with follower counts
- Last scraped at · next scheduled scrape

**Mini-charts:**
- IG posting velocity (posts/week, last 12 weeks)
- Engagement trend (avg likes per post over time)
- Product catalog growth (new SKUs per month)

---

## Tab 2 · Posts

- Grid mode (2/3/4 col) + List mode toggle (same as Feed tab)
- Sort: Recent · Top by likes · Trending (engagement velocity)
- Filter: Type (image/video/carousel) · Time window
- Each post card: image, caption preview, likes, comments, posted_at
- Click any post → opens detail sheet with Reimagine button

---

## Tab 3 · Products

- Grid mode showing image + name + price
- Filter: product_type · price range · in stock · launched in last X days
- Sort: Recent · Price asc/desc · Name
- Click product → opens detail sheet with full info + image gallery + Reimagine button
- Stats row: total SKUs · price range · avg price · new this month
- "Find similar" button → embedding search across all 52k products

---

## Tab 4 · People

- IG-style cards for each person (avatar, name, title, seniority badge)
- Sorted: Most senior first (C-Level → VP → Director → Manager → IC)
- Filter: Department (Marketing / Product / Design / etc) · Seniority · Location
- Click any person → opens their full profile (modal or new page)
- "Add person" button (Editor+ role)
- "Scan LinkedIn" button (re-pull this brand's people from LinkedIn)

---

## Tab 5 · Celebs

- Grid of celeb_photo entries linked to this brand
- Each card: photo, celeb name, eyewear type description, source (Vogue / IG / etc), date spotted
- Filter by celeb category (Actor / Musician / Athlete / Influencer)
- "Detect more" button → re-runs Vision pipeline against celeb photo database

---

## Tab 6 · Reimagines

- Gallery of every Lenskart-branded variant generated from this brand's posts
- Each card: source post thumb + reimagined image + model + date + who generated
- Click → opens side-by-side comparison
- "Generate new" button → opens Reimagine Studio prefilled with this brand context

---

## Tab 7 · Links

- Table view of every `brand_content` row of type `website_link` for this brand
- Columns: Type (sitemap / blog / page / collection / other) · Title / Label · URL · Source · Discovered
- Filter by link type
- Click URL → opens in new tab
- "Re-crawl sitemap" button to refresh product URLs

---

## Tab 8 · News (AI-generated)

- Auto-generated brand brief by Gemini, refreshed weekly
- Sections:
  - **What they're doing** — recent posts summary
  - **What they're launching** — recent products
  - **Who's joined** — recent hires
  - **What others say** — recent press mentions
  - **Lenskart take** — strategic implications (auto-generated)
- "Refresh brief" button (Editor+)

---

## Tab 9 · Comparison

- Picker: "Compare with..." dropdown of all brands
- Side-by-side table of: identity, financials, social presence, product catalog size, recent posting velocity, people headcount, our flags (D2C / Luxury etc)
- Engagement chart overlay
- Useful for: positioning analysis, hiring intel ("Warby has 3 designers we don't"), competitive bench

---

## Edit drawer (Editor / Admin only)

Slide-out drawer triggered by ⚙ Edit button. Same fields as the Add brand dialog today, plus:

- All social URL fields
- Tag management
- Linked people picker (multi-select from directory_people)
- Linked competitors picker
- Linked subsidiaries picker
- Description / notes
- Save → triggers re-completeness % calculation

---

## Mobile considerations

- Header collapses to logo + name + handle on scroll
- Tabs become bottom-sheet selector
- Side-by-side comparison stacks vertically
- Timeline is the default, posts/products/people are secondary

---

## Backend requirements

- New endpoint `/api/brands/profile?id=142` returns brand + all related counts in one call
- Each tab paginates via existing `/api/content?brand_id=X&type=Y&page=N`
- Comparison endpoint `/api/brands/compare?ids=142,37` returns side-by-side payload
- AI news endpoint `/api/brands/news?id=142` returns the weekly brief (cached 7 days)

---

## Phase priority

This is **Phase 3** of the rebuild plan — built after foundations (Phase 1) and auth (Phase 2). Should take ~1 week of focused work since the data is all there.
