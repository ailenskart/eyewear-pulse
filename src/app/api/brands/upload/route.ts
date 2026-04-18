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
  // Extended social fields (all optional)
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
    website: 'website', url: 'website', site: 'website',
    notes: 'notes', description: 'notes',
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
      employee_count: row.employee_count ? parseInt(row.employee_count) : undefined,
      hq_city: row.hq_city?.trim() || undefined,
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
