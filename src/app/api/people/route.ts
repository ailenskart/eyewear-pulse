import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * People directory — standalone table of industry professionals
 * linked to brands via brand_handles[].
 *
 *   GET    /api/people                   list with filters
 *   GET    /api/people?brand=rayban      people linked to a brand
 *   GET    /api/people?id=123            single person
 *   POST   /api/people                   create or upsert (by linkedin_url)
 *   PATCH  /api/people                   update by id
 *   DELETE /api/people?id=123            hard delete
 *
 * Filters: search, brand (handle), department, seniority, company, tags
 */

export const maxDuration = 15;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get('id');
  const brand = searchParams.get('brand');
  const department = searchParams.get('department');
  const seniority = searchParams.get('seniority');
  const company = searchParams.get('company');
  const search = searchParams.get('search');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50')));

  const client = supabaseServer();

  if (id) {
    const { data, error } = await client.from('directory_people').select('*').eq('id', parseInt(id)).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(data);
  }

  let q = client.from('directory_people').select('*', { count: 'exact' });
  if (brand) {
    // Accept either a handle (string) or a numeric id
    const n = parseInt(brand);
    if (Number.isFinite(n) && !isNaN(n)) {
      q = q.contains('brand_ids', [n]);
    } else {
      q = q.contains('brand_handles', [brand.toLowerCase()]);
    }
  }
  if (department && department !== 'All') q = q.eq('department', department);
  if (seniority && seniority !== 'All') q = q.eq('seniority', seniority);
  if (company) q = q.ilike('company_current', `%${company}%`);
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`name.ilike.${s},title.ilike.${s},company_current.ilike.${s},bio.ilike.${s}`);
  }
  q = q.order('added_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Facets
  const { data: facetsRaw } = await client.from('directory_people').select('department,seniority,company_current').limit(5000);
  const deptMap = new Map<string, number>();
  const senMap = new Map<string, number>();
  const compMap = new Map<string, number>();
  for (const r of (facetsRaw || []) as Array<{ department: string | null; seniority: string | null; company_current: string | null }>) {
    if (r.department) deptMap.set(r.department, (deptMap.get(r.department) || 0) + 1);
    if (r.seniority) senMap.set(r.seniority, (senMap.get(r.seniority) || 0) + 1);
    if (r.company_current) compMap.set(r.company_current, (compMap.get(r.company_current) || 0) + 1);
  }
  const toSorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  return NextResponse.json({
    people: data || [],
    total: count || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
    facets: {
      departments: toSorted(deptMap),
      seniorities: toSorted(senMap),
      companies: toSorted(compMap).slice(0, 30),
    },
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
  }

  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  let brandHandles: string[] = [];
  if (typeof body.brand_handles === 'string') {
    brandHandles = body.brand_handles.split(/[,;|]/).map(h => h.trim().toLowerCase()).filter(Boolean);
  } else if (Array.isArray(body.brand_handles)) {
    brandHandles = (body.brand_handles as unknown[]).map(h => String(h).trim().toLowerCase()).filter(Boolean);
  }

  let brandIds: number[] = [];
  if (typeof body.brand_ids === 'string') {
    brandIds = body.brand_ids.split(/[,;|]/).map(s => parseInt(s.trim())).filter(n => Number.isFinite(n));
  } else if (Array.isArray(body.brand_ids)) {
    brandIds = (body.brand_ids as unknown[]).map(n => parseInt(String(n))).filter(n => Number.isFinite(n));
  }

  // If only one of handles/ids was provided, auto-resolve the other from tracked_brands
  const clientForResolve = supabaseServer();
  if (brandHandles.length > 0 && brandIds.length === 0) {
    const { data: resolved } = await clientForResolve
      .from('tracked_brands').select('id,handle').in('handle', brandHandles);
    brandIds = (resolved || []).map((r: { id: number }) => r.id);
  } else if (brandIds.length > 0 && brandHandles.length === 0) {
    const { data: resolved } = await clientForResolve
      .from('tracked_brands').select('id,handle').in('id', brandIds);
    brandHandles = (resolved || []).map((r: { handle: string }) => r.handle);
  }

  let previousCompanies: string[] | null = null;
  if (typeof body.previous_companies === 'string') {
    previousCompanies = body.previous_companies.split(/[,;|]/).map(c => c.trim()).filter(Boolean);
  } else if (Array.isArray(body.previous_companies)) {
    previousCompanies = (body.previous_companies as unknown[]).map(c => String(c).trim()).filter(Boolean);
  }

  let tags: string[] | null = null;
  if (typeof body.tags === 'string') {
    tags = body.tags.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
  } else if (Array.isArray(body.tags)) {
    tags = (body.tags as unknown[]).map(t => String(t).trim()).filter(Boolean);
  }

  const row = {
    name,
    title: body.title ? String(body.title).trim() : null,
    department: body.department ? String(body.department).trim() : null,
    seniority: body.seniority ? String(body.seniority).trim() : null,
    linkedin_url: body.linkedin_url ? String(body.linkedin_url).trim() : null,
    photo_url: body.photo_url ? String(body.photo_url).trim() : null,
    email: body.email ? String(body.email).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    location: body.location ? String(body.location).trim() : null,
    company_current: body.company_current ? String(body.company_current).trim() : null,
    brand_handles: brandHandles,
    brand_ids: brandIds,
    previous_companies: previousCompanies,
    tenure: body.tenure ? String(body.tenure).trim() : null,
    bio: body.bio ? String(body.bio).trim() : null,
    tags,
    source: body.source ? String(body.source) : 'manual',
    updated_at: new Date().toISOString(),
  };

  const client = supabaseServer();

  // If linkedin_url is set, try to upsert by it (natural dedup key)
  if (row.linkedin_url) {
    const { data: existing } = await client
      .from('directory_people')
      .select('id')
      .eq('linkedin_url', row.linkedin_url)
      .maybeSingle();
    if (existing) {
      const { data, error } = await client
        .from('directory_people')
        .update(row)
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, person: data, updated: true });
    }
  }

  const { data, error } = await client.from('directory_people').insert(row).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, person: data, inserted: true });
}

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
  }

  const id = body.id ? parseInt(String(body.id)) : null;
  if (!id) return NextResponse.json({ error: 'id is required in body' }, { status: 400 });

  const editable = [
    'name', 'title', 'department', 'seniority', 'linkedin_url', 'photo_url',
    'email', 'phone', 'location', 'company_current', 'brand_handles', 'brand_ids',
    'previous_companies', 'tenure', 'bio', 'tags', 'source',
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of editable) {
    if (k in body) {
      let val = body[k];
      if (['brand_handles', 'previous_companies', 'tags'].includes(k) && typeof val === 'string') {
        val = (val as string).split(/[,;|]/).map(s => s.trim()).filter(Boolean);
      }
      if (k === 'brand_ids' && typeof val === 'string') {
        val = (val as string).split(/[,;|]/).map(s => parseInt(s.trim())).filter(n => Number.isFinite(n));
      }
      if (k === 'brand_ids' && Array.isArray(val)) {
        val = (val as unknown[]).map(n => parseInt(String(n))).filter(n => Number.isFinite(n));
      }
      if (k === 'brand_handles' && Array.isArray(val)) {
        val = (val as unknown[]).map(h => String(h).trim().toLowerCase()).filter(Boolean);
      }
      updates[k] = val;
    }
  }

  // Auto-resolve the other side if only one was sent
  const clientForResolve = supabaseServer();
  if ('brand_handles' in updates && !('brand_ids' in updates)) {
    const handles = updates.brand_handles as string[];
    if (handles.length > 0) {
      const { data } = await clientForResolve.from('tracked_brands').select('id').in('handle', handles);
      updates.brand_ids = (data || []).map((r: { id: number }) => r.id);
    } else updates.brand_ids = [];
  } else if ('brand_ids' in updates && !('brand_handles' in updates)) {
    const ids = updates.brand_ids as number[];
    if (ids.length > 0) {
      const { data } = await clientForResolve.from('tracked_brands').select('handle').in('id', ids);
      updates.brand_handles = (data || []).map((r: { handle: string }) => r.handle);
    } else updates.brand_handles = [];
  }

  const client = supabaseServer();
  const { data, error } = await client.from('directory_people').update(updates).eq('id', id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, person: data });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 });

  const client = supabaseServer();
  const { error } = await client.from('directory_people').delete().eq('id', parseInt(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: parseInt(id) });
}
