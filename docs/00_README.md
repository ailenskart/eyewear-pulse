# Lenzy — Vision & Rebuild Documentation

This folder contains the complete vision, module specs, data architecture, integration costs, and phased rebuild plan for taking Lenzy from MVP to production-grade.

## Read in order

1. **[01_VISION.md](./01_VISION.md)** — what Lenzy is, why it exists, who uses it, the unfair advantage, 3-year horizon
2. **[02_MODULES.md](./02_MODULES.md)** — 10 modules with what/why/today/tomorrow per module
3. **[03_BRAND_PAGE.md](./03_BRAND_PAGE.md)** — full spec for the per-brand deep-dive page (the missing UX piece)
4. **[04_DATA_SCHEMA.md](./04_DATA_SCHEMA.md)** — every table, every column, indexes, relationships
5. **[05_INTEGRATIONS_AND_COSTS.md](./05_INTEGRATIONS_AND_COSTS.md)** — every API used or planned, monthly cost estimates ($400–1,200/mo range)
6. **[06_REBUILD_PLAN.md](./06_REBUILD_PLAN.md)** — 8-week, 6-phase rebuild plan with success criteria per phase

## What we built so far (the MVP)

In ~2 weeks of work this turned from a frame-swap reimagine prototype into a brand-centric intelligence platform with:

- **3,500+ brands** in the directory (3,094 from your xlsx + 400 seeded)
- **163,000+ rows** in `brand_content` polymorphic table
- **52,451 products** scraped or imported
- **2,045 IG posts** from 310+ brands via Apify
- **1,612 people** mapped to companies (1,571 from xlsx, 41 manually seeded A-listers)
- **160 celebrities** in the catalog with Vision-based eyewear detection pipeline
- **30+ API endpoints** powering Feed, Intel, Reimagine, Celebrities, Visual Trends, News digest
- **Tiered cron** (hourly fast / 6-hour mid / daily full) for IG scraping
- **Reimagine Studio** with FLUX Kontext + Vercel Blob persistence
- **Two-table architecture** consolidated: `tracked_brands` + `brand_content` + (denormalized `directory_people`)
- **Unified export endpoint** for downstream enrichment via Manus/Perplexity/ChatGPT

## What needs to happen next

To go from MVP to production grade:

1. **Foundations** — split the monolithic page.tsx, design system, Zod validation, Supabase RLS, Sentry, tests
2. **Auth** — Google SSO, roles (Admin/Editor/Viewer), per-user data, audit log
3. **Brand detail pages** — the missing UX piece, complete profile per brand
4. **Unbranded eyewear detection** — Vision + embeddings to detect eyewear in any photo and match to catalog
5. **Intelligence features** — Meta Ad Library, Crunchbase + SimilarWeb enrichment, daily digest emails, "people who recently moved" feed
6. **Polish + scale** — design system pass, a11y, edge caching, image pipeline, admin dashboard

8 weeks total at ~$400–700/mo in API spend.

## What I need from you to start

Read all 6 docs. Redline anything you disagree with. When you're ready:

1. **Approve scope + budget** ($400–700/mo recommended)
2. **Provide env vars** for new services (Sentry, Resend, Upstash, OpenAI, Google OAuth)
3. **List allowed emails** for the team
4. **Decide multi-tenant vs Lenskart-only**

Then I start Phase 1.
