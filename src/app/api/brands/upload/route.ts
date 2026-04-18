import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Bulk brand upload.
 *
 * Accepts:
 *   1. multipart/form-data with a `file` field (CSV / JSON / TXT)
 *   2. application/json with { rows: [...] } — a pre-parsed array
 *   3. text/csv or text/plain body — raw file content as the body
 *
 * Supported formats:
 *   - CSV with headers (comma OR tab delimited). Column aliases:
 *       handle | username | ig | instagram_handle
 *       name | brand | brand_name
 *       category | type
 *       region
 *       price_range | priceRange | price
 *       country
 *       website | url
 *       notes | description
 *       tier  (fast | mid | full)
 *   - JSON array of objects with the same keys
 *   - Plain text: one Instagram handle per line (name defaults
 *     to a titlecased version of the handle)
 *
 * Writes to `tracked_brands` with upsert on `handle`. Logs every
 * upload to `brand_upload_log` for auditing.
 *
 * Usage:
 *   POST /api/brands/upload            (file / body)
 *   POST /api/brands/upload?dryRun=1   (preview parsing without writing)
 */

export const maxDuration = 30;

interface ParsedBrand {
  handle: string;
  name: string;
  category?: string;
  region?: string;
  price_range?: string;
  subcategory?: string;
  country?: string;
  website?: string;
  notes?: string;
  tier?: 'fast' | 'mid' | 'full';
  source_country?: string;
  instagram_url?: string;
  facebook_url?: string;
  twitter_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  linkedin_url?: string;
  logo_url?: string;
  founded_year?: number;
  employee_count?: number;
  hq_city?: string;
  // Full-profile
  iso_code?: string;
  business_type?: string;
  instagram_followers?: number;
  store_count?: number;
  revenue_estimate?: number;
  is_public?: boolean;
  stock_ticker?: string;
  parent_company?: string;
  ownership_type?: string;
  has_manufacturing?: boolean;
  sustainability_focus?: string;
  ceo_name?: string;
  naics_code?: string;
  sic_code?: string;
  description?: string;
  tags?: string[];
  confidence_pct?: number;
}

function parseBoolCell(raw: string | undefined): boolean | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase().trim();
  if (['true','yes','y','1','public','publicly traded'].includes(s)) return true;
  if (['false','no','n','0','private'].includes(s)) return false;
  return undefined;
}

function parseTagsCell(raw: string | undefined): string[] | undefined {
  if (!raw || !raw.trim()) return undefined;
  return raw.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
}

function parseNumCell(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Handle suffixes like 1.2M, 500K, 2B
  const suffixMatch = trimmed.match(/^([\d,.]+)\s*([kKmMbB])$/);
  if (suffixMatch) {
    const base = parseFloat(suffixMatch[1].replace(/,/g, ''));
    const mult = suffixMatch[2].toLowerCase();
    if (mult === 'k') return base * 1e3;
    if (mult === 'm') return base * 1e6;
    if (mult === 'b') return base * 1e9;
  }
  const cleaned = trimmed.replace(/[$,€£¥₹\s]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeUrl(raw: string | undefined | null, prefix: string): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const clean = trimmed.replace(/^@/, '').replace(/\/$/, '');
  return `${prefix}${clean}`;
}

/* ─── Normalizers ─── */

function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/\/$/, '')
    .replace(/\?.*$/, '')
    .replace(/\s+/g, '');
}

function titlecase(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeTier(raw: string | undefined): 'fast' | 'mid' | 'full' {
  const t = (raw || '').toLowerCase().trim();
  if (t === 'fast' || t === 'mid' || t === 'full') return t;
  return 'full';
}

/* ─── Parsers ─── */

function parseCsv(text: string): ParsedBrand[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
  if (lines.length === 0) return [];

  // Auto-detect delimiter
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const splitLine = (line: string): string[] => {
    // Simple CSV splitter that handles quoted fields
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === delim && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out.map(c => c.trim());
  };

  // Detect header row
  const HEADER_ALIASES: Record<string, string> = {
    handle: 'handle', username: 'handle', ig: 'handle', instagram: 'handle', instagram_handle: 'handle',
    name: 'name', brand: 'name', brand_name: 'name', 'brand name': 'name',
    category: 'category', type: 'category',
    region: 'region',
    price_range: 'price_range', pricerange: 'price_range', price: 'price_range', 'price range': 'price_range',
    subcategory: 'subcategory',
    country: 'country',
    source_country: 'source_country', sourcecountry: 'source_country', 'source country': 'source_country',
    source: 'source_country', sourced_from: 'source_country', sourced_in: 'source_country',
    manufactured_in: 'source_country', made_in: 'source_country', origin: 'source_country',
    website: 'website', url: 'website', site: 'website',
    notes: 'notes',
    tier: 'tier',
    instagram_url: 'instagram_url', ig_url: 'instagram_url',
    facebook_url: 'facebook_url', fb_url: 'facebook_url', fb: 'facebook_url', facebook: 'facebook_url',
    twitter_url: 'twitter_url', x_url: 'twitter_url', x: 'twitter_url', twitter: 'twitter_url',
    tiktok_url: 'tiktok_url', tiktok: 'tiktok_url', tt: 'tiktok_url',
    youtube_url: 'youtube_url', youtube: 'youtube_url', yt: 'youtube_url',
    linkedin_url: 'linkedin_url', linkedin: 'linkedin_url', li: 'linkedin_url',
    logo_url: 'logo_url', logo: 'logo_url',
    founded_year: 'founded_year', founded: 'founded_year', year_founded: 'founded_year',
    employee_count: 'employee_count', employees: 'employee_count', headcount: 'employee_count',
    hq_city: 'hq_city', hq: 'hq_city', city: 'hq_city',
    headquarters: 'hq_city',
    // Full profile
    id: '__ignore_id__',
    'company name': 'name', company: 'name',
    iso_code: 'iso_code', iso: 'iso_code', 'iso code': 'iso_code', countrycode: 'iso_code', country_code: 'iso_code',
    business_type: 'business_type', 'business type': 'business_type', businesstype: 'business_type',
    'primary category': 'category',
    instagram_followers: 'instagram_followers', 'instagram followers': 'instagram_followers', ig_followers: 'instagram_followers', followers: 'instagram_followers',
    store_count: 'store_count', 'store count': 'store_count', stores: 'store_count', 'number of stores': 'store_count', 'retail stores': 'store_count',
    revenue_estimate: 'revenue_estimate', 'revenue estimate': 'revenue_estimate', revenue: 'revenue_estimate', sales: 'revenue_estimate', 'annual revenue': 'revenue_estimate',
    is_public: 'is_public', 'publicly traded': 'is_public', public: 'is_public', 'is public': 'is_public',
    stock_ticker: 'stock_ticker', 'stock ticker': 'stock_ticker', ticker: 'stock_ticker', stock: 'stock_ticker', symbol: 'stock_ticker',
    parent_company: 'parent_company', 'parent company': 'parent_company', parent: 'parent_company', owner: 'parent_company',
    ownership_type: 'ownership_type', 'ownership type': 'ownership_type', ownership: 'ownership_type', 'ownership structure': 'ownership_type',
    'price tier': 'price_range', pricetier: 'price_range',
    has_manufacturing: 'has_manufacturing', 'has manufacturing': 'has_manufacturing', manufacturing: 'has_manufacturing', owns_factory: 'has_manufacturing',
    sustainability_focus: 'sustainability_focus', 'sustainability focus': 'sustainability_focus', sustainability: 'sustainability_focus', sustainable: 'sustainability_focus',
    ceo_name: 'ceo_name', 'ceo name': 'ceo_name', ceo: 'ceo_name', founder: 'ceo_name',
    naics_code: 'naics_code', 'naics code': 'naics_code', naics: 'naics_code',
    sic_code: 'sic_code', 'sic code': 'sic_code', sic: 'sic_code',
    description: 'description', about: 'description', bio: 'description', summary: 'description',
    tags: 'tags',
    confidence_pct: 'confidence_pct', 'confidence %': 'confidence_pct', 'confidence': 'confidence_pct', 'confidence pct': 'confidence_pct',
    'completeness %': '__ignore_completeness__', completeness: '__ignore_completeness__',
  };

  const firstCells = splitLine(lines[0]).map(c => c.toLowerCase());
  const hasHeader = firstCells.some(c => c in HEADER_ALIASES);

  let headers: string[];
  let dataStart: number;
  if (hasHeader) {
    headers = firstCells.map(c => HEADER_ALIASES[c] || c);
    dataStart = 1;
  } else {
    // No header — assume first column is handle, rest are whatever
    headers = firstCells.map((_, i) => i === 0 ? 'handle' : i === 1 ? 'name' : i === 2 ? 'category' : `col${i}`);
    dataStart = 0;
  }

  const rows: ParsedBrand[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length && j < cells.length; j++) {
      row[headers[j]] = cells[j];
    }
    const handle = normalizeHandle(row.handle || cells[0] || '');
    if (!handle || handle.length > 50) continue;
    rows.push({
      handle,
      name: row.name?.trim() || titlecase(handle),
      category: row.category?.trim() || undefined,
      region: row.region?.trim() || undefined,
      price_range: row.price_range?.trim() || undefined,
      subcategory: row.subcategory?.trim() || undefined,
      country: row.country?.trim() || undefined,
      source_country: row.source_country?.trim() || undefined,
      website: row.website?.trim() || undefined,
      notes: row.notes?.trim() || undefined,
      tier: row.tier ? normalizeTier(row.tier) : undefined,
      instagram_url: normalizeUrl(row.instagram_url, 'https://instagram.com/') || undefined,
      facebook_url: normalizeUrl(row.facebook_url, 'https://facebook.com/') || undefined,
      twitter_url: normalizeUrl(row.twitter_url, 'https://x.com/') || undefined,
      tiktok_url: normalizeUrl(row.tiktok_url, 'https://tiktok.com/@') || undefined,
      youtube_url: normalizeUrl(row.youtube_url, 'https://youtube.com/@') || undefined,
      linkedin_url: row.linkedin_url?.trim() || undefined,
      logo_url: row.logo_url?.trim() || undefined,
      founded_year: row.founded_year ? parseInt(row.founded_year) : undefined,
      employee_count: row.employee_count ? parseNumCell(row.employee_count) : undefined,
      hq_city: row.hq_city?.trim() || undefined,
      iso_code: row.iso_code?.trim().toUpperCase() || undefined,
      business_type: row.business_type?.trim() || undefined,
      instagram_followers: parseNumCell(row.instagram_followers),
      store_count: parseNumCell(row.store_count),
      revenue_estimate: parseNumCell(row.revenue_estimate),
      is_public: parseBoolCell(row.is_public),
      stock_ticker: row.stock_ticker?.trim().toUpperCase() || undefined,
      parent_company: row.parent_company?.trim() || undefined,
      ownership_type: row.ownership_type?.trim() || undefined,
      has_manufacturing: parseBoolCell(row.has_manufacturing),
      sustainability_focus: row.sustainability_focus?.trim() || undefined,
      ceo_name: row.ceo_name?.trim() || undefined,
      naics_code: row.naics_code?.trim() || undefined,
      sic_code: row.sic_code?.trim() || undefined,
      description: row.description?.trim() || undefined,
      tags: parseTagsCell(row.tags),
      confidence_pct: row.confidence_pct ? Math.max(0, Math.min(100, Math.round(parseFloat(row.confidence_pct.replace('%', ''))))) : undefined,
    });
  }
  return rows;
}

function parsePlainText(text: string): ParsedBrand[] {
  const out: ParsedBrand[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const handle = normalizeHandle(trimmed);
    if (!handle) continue;
    out.push({ handle, name: titlecase(handle) });
  }
  return out;
}

function parseJsonArray(raw: unknown): ParsedBrand[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedBrand[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    if (typeof item === 'string') {
      const handle = normalizeHandle(item);
      if (handle) out.push({ handle, name: titlecase(handle) });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const rawHandle = (item.handle || item.username || item.ig || item.instagram_handle || item.instagram) as string | undefined;
    const handle = normalizeHandle(rawHandle || '');
    if (!handle) continue;
    out.push({
      handle,
      name: String(item.name || item.brand || item.brand_name || titlecase(handle)),
      category: item.category ? String(item.category) : undefined,
      region: item.region ? String(item.region) : undefined,
      price_range: item.price_range ? String(item.price_range) : (item.priceRange ? String(item.priceRange) : undefined),
      subcategory: item.subcategory ? String(item.subcategory) : undefined,
      country: item.country ? String(item.country) : undefined,
      source_country: item.source_country ? String(item.source_country) : (item.origin ? String(item.origin) : (item.made_in ? String(item.made_in) : undefined)),
      website: item.website ? String(item.website) : (item.url ? String(item.url) : undefined),
      notes: item.notes ? String(item.notes) : (item.description ? String(item.description) : undefined),
      tier: item.tier ? normalizeTier(String(item.tier)) : undefined,
      instagram_url: normalizeUrl(String(item.instagram_url || item.instagram || ''), 'https://instagram.com/') || undefined,
      facebook_url: normalizeUrl(String(item.facebook_url || item.facebook || item.fb || ''), 'https://facebook.com/') || undefined,
      twitter_url: normalizeUrl(String(item.twitter_url || item.twitter || item.x || ''), 'https://x.com/') || undefined,
      tiktok_url: normalizeUrl(String(item.tiktok_url || item.tiktok || ''), 'https://tiktok.com/@') || undefined,
      youtube_url: normalizeUrl(String(item.youtube_url || item.youtube || ''), 'https://youtube.com/@') || undefined,
      linkedin_url: item.linkedin_url ? String(item.linkedin_url) : (item.linkedin ? String(item.linkedin) : undefined),
      logo_url: item.logo_url ? String(item.logo_url) : (item.logo ? String(item.logo) : undefined),
      founded_year: item.founded_year ? Number(item.founded_year) : (item.founded ? Number(item.founded) : undefined),
      employee_count: item.employee_count ? Number(item.employee_count) : (item.employees ? Number(item.employees) : undefined),
      hq_city: item.hq_city ? String(item.hq_city) : (item.headquarters ? String(item.headquarters) : undefined),
      iso_code: item.iso_code ? String(item.iso_code).toUpperCase() : undefined,
      business_type: item.business_type ? String(item.business_type) : undefined,
      instagram_followers: item.instagram_followers != null ? Number(item.instagram_followers) : (item.followers != null ? Number(item.followers) : undefined),
      store_count: item.store_count != null ? Number(item.store_count) : (item.stores != null ? Number(item.stores) : undefined),
      revenue_estimate: item.revenue_estimate != null ? Number(item.revenue_estimate) : (item.revenue != null ? Number(item.revenue) : undefined),
      is_public: typeof item.is_public === 'boolean' ? item.is_public : parseBoolCell(item.is_public ? String(item.is_public) : (item['publicly_traded'] ? String(item['publicly_traded']) : undefined)),
      stock_ticker: item.stock_ticker ? String(item.stock_ticker).toUpperCase() : (item.ticker ? String(item.ticker).toUpperCase() : undefined),
      parent_company: item.parent_company ? String(item.parent_company) : (item.parent ? String(item.parent) : undefined),
      ownership_type: item.ownership_type ? String(item.ownership_type) : (item.ownership ? String(item.ownership) : undefined),
      has_manufacturing: typeof item.has_manufacturing === 'boolean' ? item.has_manufacturing : parseBoolCell(item.has_manufacturing ? String(item.has_manufacturing) : undefined),
      sustainability_focus: item.sustainability_focus ? String(item.sustainability_focus) : (item.sustainability ? String(item.sustainability) : undefined),
      ceo_name: item.ceo_name ? String(item.ceo_name) : (item.ceo ? String(item.ceo) : undefined),
      naics_code: item.naics_code ? String(item.naics_code) : (item.naics ? String(item.naics) : undefined),
      sic_code: item.sic_code ? String(item.sic_code) : (item.sic ? String(item.sic) : undefined),
      description: item.description ? String(item.description) : (item.about ? String(item.about) : undefined),
      tags: Array.isArray(item.tags) ? (item.tags as unknown[]).map(t => String(t).trim()).filter(Boolean) : (typeof item.tags === 'string' ? parseTagsCell(item.tags as string) : undefined),
      confidence_pct: item.confidence_pct != null ? Math.max(0, Math.min(100, Math.round(Number(item.confidence_pct)))) : undefined,
    });
  }
  return out;
}

function detectFormatAndParse(content: string, filename: string | null): { rows: ParsedBrand[]; format: 'csv' | 'json' | 'text' } {
  const trimmed = content.trim();
  const lower = (filename || '').toLowerCase();

  // Explicit JSON (array)
  if (trimmed.startsWith('[') || trimmed.startsWith('{') || lower.endsWith('.json')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rows = Array.isArray(parsed) ? parseJsonArray(parsed) : parseJsonArray([parsed]);
      return { rows, format: 'json' };
    } catch { /* fall through */ }
  }

  // CSV / TSV
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || trimmed.includes(',') || trimmed.includes('\t')) {
    const rows = parseCsv(trimmed);
    if (rows.length > 0) return { rows, format: 'csv' };
  }

  // Plain text (one handle per line)
  return { rows: parsePlainText(trimmed), format: 'text' };
}

/* ─── Handler ─── */

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  let rows: ParsedBrand[] = [];
  let format: 'csv' | 'json' | 'text' = 'text';
  let filename: string | null = null;

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'file field missing in multipart body' }, { status: 400 });
      }
      filename = (file as File).name;
      const content = await (file as File).text();
      const parsed = detectFormatAndParse(content, filename);
      rows = parsed.rows;
      format = parsed.format;
    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      if (Array.isArray(body)) {
        rows = parseJsonArray(body);
        format = 'json';
      } else if (body && typeof body === 'object') {
        if (Array.isArray(body.rows)) {
          rows = parseJsonArray(body.rows);
          format = 'json';
        } else if (typeof body.text === 'string') {
          const parsed = detectFormatAndParse(body.text, body.filename || null);
          rows = parsed.rows;
          format = parsed.format;
          filename = body.filename || null;
        } else {
          return NextResponse.json({ error: 'JSON body must be an array or { rows: [...] } or { text: "..." }' }, { status: 400 });
        }
      }
    } else {
      const text = await request.text();
      const parsed = detectFormatAndParse(text, null);
      rows = parsed.rows;
      format = parsed.format;
    }
  } catch (err) {
    return NextResponse.json({ error: `Parse failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No brands parsed from input. Check format — supported: CSV, JSON, or plain text with one handle per line.' }, { status: 400 });
  }

  // Dedup within the upload (keep first occurrence)
  const seen = new Set<string>();
  const deduped: ParsedBrand[] = [];
  for (const r of rows) {
    if (seen.has(r.handle)) continue;
    seen.add(r.handle);
    deduped.push(r);
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      format,
      filename,
      parsed: deduped.length,
      sample: deduped.slice(0, 10),
      duplicates: rows.length - deduped.length,
    });
  }

  const client = supabaseServer();
  const now = new Date().toISOString();
  const dbRows = deduped.map(r => ({
    handle: r.handle,
    name: r.name,
    category: r.category || null,
    region: r.region || null,
    price_range: r.price_range || null,
    subcategory: r.subcategory || null,
    country: r.country || null,
    source_country: r.source_country || null,
    website: r.website || null,
    notes: r.notes || null,
    tier: r.tier || 'full',
    active: true,
    source: 'upload',
    instagram_url: r.instagram_url || `https://instagram.com/${r.handle}`,
    facebook_url: r.facebook_url || null,
    twitter_url: r.twitter_url || null,
    tiktok_url: r.tiktok_url || null,
    youtube_url: r.youtube_url || null,
    linkedin_url: r.linkedin_url || null,
    logo_url: r.logo_url || null,
    founded_year: r.founded_year || null,
    employee_count: r.employee_count || null,
    hq_city: r.hq_city || null,
    iso_code: r.iso_code || null,
    business_type: r.business_type || null,
    instagram_followers: r.instagram_followers ?? null,
    store_count: r.store_count ?? null,
    revenue_estimate: r.revenue_estimate ?? null,
    is_public: typeof r.is_public === 'boolean' ? r.is_public : null,
    stock_ticker: r.stock_ticker || null,
    parent_company: r.parent_company || null,
    ownership_type: r.ownership_type || null,
    has_manufacturing: typeof r.has_manufacturing === 'boolean' ? r.has_manufacturing : null,
    sustainability_focus: r.sustainability_focus || null,
    ceo_name: r.ceo_name || null,
    naics_code: r.naics_code || null,
    sic_code: r.sic_code || null,
    description: r.description || null,
    tags: r.tags || null,
    confidence_pct: r.confidence_pct ?? null,
    added_at: now,
  }));

  // Check which handles already exist so we can report inserted vs updated
  const { data: existingData } = await client
    .from('tracked_brands')
    .select('handle')
    .in('handle', dbRows.map(r => r.handle));
  const existingHandles = new Set((existingData || []).map((r: { handle: string }) => r.handle));

  const { error: upsertError } = await client
    .from('tracked_brands')
    .upsert(dbRows, { onConflict: 'handle', ignoreDuplicates: false });

  if (upsertError) {
    return NextResponse.json({ error: `DB upsert failed: ${upsertError.message}` }, { status: 500 });
  }

  const inserted = dbRows.filter(r => !existingHandles.has(r.handle)).length;
  const updated = dbRows.filter(r => existingHandles.has(r.handle)).length;

  // Audit log
  await client.from('brand_upload_log').insert({
    filename,
    format,
    total_rows: rows.length,
    inserted,
    updated,
    skipped: rows.length - deduped.length,
    summary: {
      sampleHandles: deduped.slice(0, 5).map(r => r.handle),
      dedupedOut: rows.length - deduped.length,
    },
  });

  return NextResponse.json({
    success: true,
    format,
    filename,
    totalRows: rows.length,
    parsed: deduped.length,
    inserted,
    updated,
    duplicates: rows.length - deduped.length,
    message: `${inserted} new, ${updated} updated${rows.length - deduped.length > 0 ? `, ${rows.length - deduped.length} duplicates dropped` : ''}.`,
  });
}
