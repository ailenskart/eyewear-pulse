import { z } from 'zod';

/**
 * Canonical brand payload schema. Used by:
 *  - POST /api/brands/create  (new brand via UI form)
 *  - PATCH /api/brands/tracked
 *  - POST /api/brands/upload  (after CSV/JSON parse)
 */

const urlOrHandle = z.string().trim().max(500).optional().nullable();

export const brandInputSchema = z.object({
  handle: z.string().trim().min(1).max(50)
    .transform(s => s
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
      .replace(/\/$/, '')
      .replace(/\?.*$/, '')
      .replace(/\s+/g, '')),
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).optional().nullable(),
  region: z.string().trim().max(100).optional().nullable(),
  price_range: z.string().trim().max(50).optional().nullable(),
  subcategory: z.string().trim().max(100).optional().nullable(),
  country: z.string().trim().max(100).optional().nullable(),
  iso_code: z.string().trim().max(10).optional().nullable()
    .transform(v => v ? v.toUpperCase() : v),
  hq_city: z.string().trim().max(100).optional().nullable(),
  founded_year: z.coerce.number().int().min(1800).max(2100).optional().nullable(),
  business_type: z.string().trim().max(100).optional().nullable(),
  business_model: z.string().trim().max(100).optional().nullable(),
  product_focus: z.string().trim().max(200).optional().nullable(),
  parent_company: z.string().trim().max(200).optional().nullable(),
  ownership_type: z.string().trim().max(100).optional().nullable(),
  is_public: z.union([z.boolean(), z.string().transform(v => ['yes','true','1','publicly traded'].includes(v.toLowerCase()))]).optional().nullable(),
  stock_ticker: z.string().trim().max(20).optional().nullable()
    .transform(v => v ? v.toUpperCase() : v),
  has_manufacturing: z.union([z.boolean(), z.string().transform(v => ['yes','true','1'].includes(v.toLowerCase()))]).optional().nullable(),
  is_d2c: z.union([z.boolean(), z.string().transform(v => ['yes','true','1'].includes(v.toLowerCase()))]).optional().nullable(),
  is_manufacturer: z.union([z.boolean(), z.string().transform(v => ['yes','true','1'].includes(v.toLowerCase()))]).optional().nullable(),
  is_retailer: z.union([z.boolean(), z.string().transform(v => ['yes','true','1'].includes(v.toLowerCase()))]).optional().nullable(),
  is_luxury: z.union([z.boolean(), z.string().transform(v => ['yes','true','1'].includes(v.toLowerCase()))]).optional().nullable(),
  is_independent: z.union([z.boolean(), z.string().transform(v => ['yes','true','1'].includes(v.toLowerCase()))]).optional().nullable(),
  is_smart_eyewear: z.union([z.boolean(), z.string().transform(v => ['yes','true','1'].includes(v.toLowerCase()))]).optional().nullable(),
  sustainability_focus: z.string().trim().max(500).optional().nullable(),
  ceo_name: z.string().trim().max(200).optional().nullable(),
  employee_count: z.coerce.number().int().min(0).optional().nullable(),
  store_count: z.coerce.number().int().min(0).optional().nullable(),
  revenue_estimate: z.coerce.number().min(0).optional().nullable(),
  instagram_followers: z.coerce.number().int().min(0).optional().nullable(),
  monthly_traffic: z.string().trim().max(50).optional().nullable(),
  website: urlOrHandle,
  instagram_url: urlOrHandle,
  facebook_url: urlOrHandle,
  twitter_url: urlOrHandle,
  tiktok_url: urlOrHandle,
  youtube_url: urlOrHandle,
  linkedin_url: urlOrHandle,
  logo_url: urlOrHandle,
  naics_code: z.string().trim().max(20).optional().nullable(),
  sic_code: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  tags: z.union([z.array(z.string()), z.string().transform(s => s.split(/[,;|]/).map(t => t.trim()).filter(Boolean))]).optional().nullable(),
  confidence_pct: z.coerce.number().int().min(0).max(100).optional().nullable(),
  tier: z.enum(['fast', 'mid', 'full']).optional().default('full'),
  active: z.boolean().optional().default(true),
});

export type BrandInput = z.infer<typeof brandInputSchema>;

export const personInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional().nullable(),
  department: z.string().trim().max(100).optional().nullable(),
  seniority: z.string().trim().max(100).optional().nullable(),
  linkedin_url: z.string().trim().max(500).optional().nullable(),
  photo_url: z.string().trim().max(500).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal('').transform(() => null)),
  phone: z.string().trim().max(50).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  company_current: z.string().trim().max(200).optional().nullable(),
  brand_ids: z.union([z.array(z.coerce.number()), z.string().transform(s => s.split(/[,;|]/).map(n => parseInt(n.trim())).filter(Number.isFinite))]).optional().nullable(),
  brand_handles: z.union([z.array(z.string()), z.string().transform(s => s.split(/[,;|]/).map(t => t.trim().toLowerCase()).filter(Boolean))]).optional().nullable(),
  previous_companies: z.union([z.array(z.string()), z.string().transform(s => s.split(/[,;|]/).map(t => t.trim()).filter(Boolean))]).optional().nullable(),
  tenure: z.string().trim().max(100).optional().nullable(),
  bio: z.string().trim().max(5000).optional().nullable(),
  tags: z.union([z.array(z.string()), z.string().transform(s => s.split(/[,;|]/).map(t => t.trim()).filter(Boolean))]).optional().nullable(),
});

export type PersonInput = z.infer<typeof personInputSchema>;
