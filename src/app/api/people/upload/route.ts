import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Bulk people upload — CSV / JSON / text.
 *
 * CSV columns (any subset, flexible aliases):
 *   name, title, department, seniority, linkedin_url, photo_url,
 *   email, phone, location, company_current, brand_handles,
 *   previous_companies, tenure, bio, tags
 *
 * brand_handles accepts comma or semicolon-separated handles.
 *
 *   POST /api/people/upload        (file / body)
 *   POST /api/people/upload?dryRun=1
 */

export const maxDuration = 30;

interface ParsedPerson {
  name: string;
  title?: string;
  department?: string;
  seniority?: string;
  linkedin_url?: string;
  photo_url?: string;
  email?: string;
  phone?: string;
  location?: string;
  company_current?: string;
  brand_handles?: string[];
  previous_companies?: string[];
  tenure?: string;
  bio?: string;
  tags?: string[];
}

const ALIASES: Record<string, string> = {
  name: 'name', 'full name': 'name', fullname: 'name', person: 'name',
  title: 'title', 'job title': 'title', jobtitle: 'title', role: 'title', position: 'title',
  department: 'department', dept: 'department', team: 'department', function: 'department',
  seniority: 'seniority', level: 'seniority', 'seniority level': 'seniority',
  linkedin_url: 'linkedin_url', linkedin: 'linkedin_url', 'linkedin url': 'linkedin_url', li: 'linkedin_url',
  photo_url: 'photo_url', photo: 'photo_url', image: 'photo_url', avatar: 'photo_url',
  email: 'email', 'email address': 'email',
  phone: 'phone', mobile: 'phone', telephone: 'phone',
  location: 'location', city: 'location', country: 'location',
  company_current: 'company_current', company: 'company_current', 'current company': 'company_current', employer: 'company_current',
  brand_handles: 'brand_handles', brands: 'brand_handles', 'brand ids': 'brand_handles', 'brand id': 'brand_handles', handles: 'brand_handles', 'linked brands': 'brand_handles',
  previous_companies: 'previous_companies', 'previous companies': 'previous_companies', 'past companies': 'previous_companies', history: 'previous_companies',
  tenure: 'tenure', 'years at company': 'tenure', experience: 'tenure',
  bio: 'bio', about: 'bio', description: 'bio', notes: 'bio', summary: 'bio',
  tags: 'tags',
  id: '__ignore__', 'completeness %': '__ignore__',
};

function splitCell(raw: string | undefined): string[] | undefined {
  if (!raw || !raw.trim()) return undefined;
  return raw.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
}

function parseRows(text: string, filename: string | null): { rows: ParsedPerson[]; format: string } {
  const trimmed = text.trim();

  // JSON?
  if (trimmed.startsWith('[') || trimmed.startsWith('{') || (filename || '').endsWith('.json')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const rows: ParsedPerson[] = arr.filter(p => p && typeof p === 'object' && p.name).map(p => ({
        name: String(p.name).trim(),
        title: p.title ? String(p.title) : undefined,
        department: p.department ? String(p.department) : undefined,
        seniority: p.seniority ? String(p.seniority) : undefined,
        linkedin_url: p.linkedin_url || p.linkedin ? String(p.linkedin_url || p.linkedin) : undefined,
        photo_url: p.photo_url || p.photo ? String(p.photo_url || p.photo) : undefined,
        email: p.email ? String(p.email) : undefined,
        phone: p.phone ? String(p.phone) : undefined,
        location: p.location ? String(p.location) : undefined,
        company_current: p.company_current || p.company ? String(p.company_current || p.company) : undefined,
        brand_handles: typeof (p.brand_handles || p.brands) === 'string'
          ? splitCell(String(p.brand_handles || p.brands))
          : Array.isArray(p.brand_handles) ? p.brand_handles.map((h: unknown) => String(h).trim().toLowerCase()).filter(Boolean)
          : undefined,
        previous_companies: typeof p.previous_companies === 'string' ? splitCell(p.previous_companies) : Array.isArray(p.previous_companies) ? p.previous_companies : undefined,
        tenure: p.tenure ? String(p.tenure) : undefined,
        bio: p.bio || p.description || p.about ? String(p.bio || p.description || p.about) : undefined,
        tags: typeof p.tags === 'string' ? splitCell(p.tags) : Array.isArray(p.tags) ? p.tags : undefined,
      }));
      return { rows, format: 'json' };
    } catch { /* fallthrough */ }
  }

  // CSV
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) return { rows: [], format: 'text' };
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === delim && !inQ) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(c => c.trim());
  };

  const firstCells = split(lines[0]).map(c => c.toLowerCase());
  const hasHeader = firstCells.some(c => c in ALIASES);
  const headers = hasHeader
    ? firstCells.map(c => ALIASES[c] || c)
    : firstCells.map((_, i) => i === 0 ? 'name' : i === 1 ? 'title' : i === 2 ? 'company_current' : `col${i}`);
  const dataStart = hasHeader ? 1 : 0;

  const rows: ParsedPerson[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = split(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length && j < cells.length; j++) {
      if (!headers[j].startsWith('__')) row[headers[j]] = cells[j];
    }
    const name = (row.name || cells[0] || '').trim();
    if (!name) continue;
    rows.push({
      name,
      title: row.title?.trim() || undefined,
      department: row.department?.trim() || undefined,
      seniority: row.seniority?.trim() || undefined,
      linkedin_url: row.linkedin_url?.trim() || undefined,
      photo_url: row.photo_url?.trim() || undefined,
      email: row.email?.trim() || undefined,
      phone: row.phone?.trim() || undefined,
      location: row.location?.trim() || undefined,
      company_current: row.company_current?.trim() || undefined,
      brand_handles: splitCell(row.brand_handles)?.map(h => h.toLowerCase()),
      previous_companies: splitCell(row.previous_companies),
      tenure: row.tenure?.trim() || undefined,
      bio: row.bio?.trim() || undefined,
      tags: splitCell(row.tags),
    });
  }
  return { rows, format: rows.length > 0 ? 'csv' : 'text' };
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  let parsed: { rows: ParsedPerson[]; format: string } = { rows: [], format: 'text' };
  let filename: string | null = null;

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return NextResponse.json({ error: 'file required' }, { status: 400 });
      filename = (file as File).name;
      parsed = parseRows(await (file as File).text(), filename);
    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      if (Array.isArray(body)) parsed = parseRows(JSON.stringify(body), null);
      else if (body?.rows) parsed = parseRows(JSON.stringify(body.rows), null);
      else if (body?.text) parsed = parseRows(body.text, body.filename);
      else return NextResponse.json({ error: 'Expected array or {rows:[...]} or {text:"..."}' }, { status: 400 });
    } else {
      parsed = parseRows(await request.text(), null);
    }
  } catch (e) {
    return NextResponse.json({ error: `Parse failed: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 400 });
  }

  if (parsed.rows.length === 0) return NextResponse.json({ error: 'No people parsed from input.' }, { status: 400 });

  if (dryRun) return NextResponse.json({ dryRun: true, format: parsed.format, parsed: parsed.rows.length, sample: parsed.rows.slice(0, 5) });

  const client = supabaseServer();
  const now = new Date().toISOString();
  const dbRows = parsed.rows.map(r => ({
    name: r.name,
    title: r.title || null,
    department: r.department || null,
    seniority: r.seniority || null,
    linkedin_url: r.linkedin_url || null,
    photo_url: r.photo_url || null,
    email: r.email || null,
    phone: r.phone || null,
    location: r.location || null,
    company_current: r.company_current || null,
    brand_handles: r.brand_handles || [],
    previous_companies: r.previous_companies || null,
    tenure: r.tenure || null,
    bio: r.bio || null,
    tags: r.tags || null,
    source: 'upload',
    added_at: now,
    updated_at: now,
  }));

  const { error } = await client.from('directory_people').insert(dbRows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true, format: parsed.format, filename,
    inserted: dbRows.length,
    message: `${dbRows.length} people added to directory.`,
  });
}
