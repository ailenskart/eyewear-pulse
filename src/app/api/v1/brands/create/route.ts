/**
 * v1 brand create/upsert — Zod-validated mutation for tracked_brands.
 *
 *   POST /api/v1/brands/create   (create or upsert)
 *   PUT  /api/v1/brands/create   (explicit upsert)
 *
 * Body is validated against `brandInputSchema` from src/schemas/brand.ts.
 * The handle is normalized (strips @, IG URLs, trailing slashes, querystring).
 * Social URLs are accepted as full URLs or bare handles.
 */

import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { ok, fail, withHandler, validateBody } from '@/lib/api';
import { brandInputSchema } from '@/schemas/brand';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function normalizeSocialUrl(raw: string | null | undefined, prefix: string): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `${prefix}${trimmed.replace(/^@/, '').replace(/\/$/, '')}`;
}

function titlecase(s: string): string {
  return s.replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ').filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

async function upsert(request: NextRequest) {
  const v = await validateBody(request, brandInputSchema);
  if (!v.ok) return v.response;
  const b = v.data;

  const row = {
    handle: b.handle,
    name: b.name?.trim() || titlecase(b.handle),
    category: b.category ?? null,
    region: b.region ?? null,
    price_range: b.price_range ?? null,
    subcategory: b.subcategory ?? null,
    country: b.country ?? null,
    iso_code: b.iso_code ?? null,
    hq_city: b.hq_city ?? null,
    founded_year: b.founded_year ?? null,
    business_type: b.business_type ?? null,
    business_model: b.business_model ?? null,
    product_focus: b.product_focus ?? null,
    parent_company: b.parent_company ?? null,
    ownership_type: b.ownership_type ?? null,
    is_public: b.is_public ?? null,
    stock_ticker: b.stock_ticker ?? null,
    has_manufacturing: b.has_manufacturing ?? null,
    is_d2c: b.is_d2c ?? null,
    is_manufacturer: b.is_manufacturer ?? null,
    is_retailer: b.is_retailer ?? null,
    is_luxury: b.is_luxury ?? null,
    is_independent: b.is_independent ?? null,
    is_smart_eyewear: b.is_smart_eyewear ?? null,
    sustainability_focus: b.sustainability_focus ?? null,
    ceo_name: b.ceo_name ?? null,
    employee_count: b.employee_count ?? null,
    store_count: b.store_count ?? null,
    revenue_estimate: b.revenue_estimate ?? null,
    instagram_followers: b.instagram_followers ?? null,
    monthly_traffic: b.monthly_traffic ?? null,
    instagram_url: normalizeSocialUrl(b.instagram_url, 'https://instagram.com/') || `https://instagram.com/${b.handle}`,
    facebook_url: normalizeSocialUrl(b.facebook_url, 'https://facebook.com/'),
    twitter_url: normalizeSocialUrl(b.twitter_url, 'https://x.com/'),
    tiktok_url: normalizeSocialUrl(b.tiktok_url, 'https://tiktok.com/@'),
    youtube_url: normalizeSocialUrl(b.youtube_url, 'https://youtube.com/@'),
    linkedin_url: b.linkedin_url ?? null,
    website: b.website ?? null,
    logo_url: b.logo_url ?? null,
    naics_code: b.naics_code ?? null,
    sic_code: b.sic_code ?? null,
    description: b.description ?? null,
    notes: b.notes ?? null,
    tags: b.tags ?? null,
    confidence_pct: b.confidence_pct ?? null,
    tier: b.tier,
    active: b.active,
    source: 'manual',
    added_at: new Date().toISOString(),
  };

  const client = supabaseServer();
  const { error, data } = await client
    .from('tracked_brands')
    .upsert(row, { onConflict: 'handle', ignoreDuplicates: false })
    .select()
    .maybeSingle();

  if (error) return fail(error.message, 500);
  return ok({ success: true, brand: data });
}

export const POST = withHandler('v1.brands.create', upsert);
export const PUT = withHandler('v1.brands.create.put', upsert);
