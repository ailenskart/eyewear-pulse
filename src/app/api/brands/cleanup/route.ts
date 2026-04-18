import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Clean up suspected fake brand handles.
 *
 * A handle is suspect if any of:
 *   - Contains composite markers: 'xlenskart', 'xjj', 'xjohnjacobs',
 *     '{letters}x{letters}x{letters}' (triple-x pattern)
 *   - Was seeded (source='seed'), has been scraped, but returned 0 posts
 *   - Flagged by the caller via ?handle=foo,bar,baz
 *
 * Modes:
 *   POST /api/brands/cleanup?mode=dryrun            preview
 *   POST /api/brands/cleanup?mode=deactivate        active=false
 *   POST /api/brands/cleanup?mode=delete            hard delete
 *   POST /api/brands/cleanup?mode=clear-instagram   null out instagram_url only
 *
 * Optional body: { handles: ["foo", "bar"] } — include only these
 */

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') || 'dryrun';
  let extraHandles: string[] = [];
  try {
    const body = await request.json();
    if (body && Array.isArray(body.handles)) extraHandles = body.handles.map((h: unknown) => String(h).toLowerCase());
  } catch { /* no body */ }

  const client = supabaseServer();

  // Suspect conditions:
  // 1. composite xLenskart / xJJ handles from seed
  // 2. scraped (last_scraped_at not null) but zero posts scraped
  const { data: suspects } = await client
    .from('tracked_brands')
    .select('handle,name,source,posts_scraped,last_scraped_at,instagram_url')
    .or([
      'handle.ilike.%xlenskart%',
      'handle.ilike.%xjj%',
      'handle.ilike.%xjohnjacobs%',
      // never-worked seeded handles
      'and(source.eq.seed,posts_scraped.eq.0,last_scraped_at.not.is.null)',
    ].join(','));

  let toProcess = (suspects || []) as Array<{ handle: string; name: string; source: string | null; posts_scraped: number | null; last_scraped_at: string | null; instagram_url: string | null }>;

  if (extraHandles.length > 0) {
    const set = new Set(extraHandles);
    const { data: extraRows } = await client
      .from('tracked_brands')
      .select('handle,name,source,posts_scraped,last_scraped_at,instagram_url')
      .in('handle', extraHandles);
    for (const r of (extraRows || []) as typeof toProcess) {
      if (!toProcess.some(x => x.handle === r.handle)) toProcess.push(r);
    }
    toProcess = toProcess.filter(x => set.has(x.handle) || toProcess.some(y => y.handle === x.handle));
  }

  if (mode === 'dryrun') {
    return NextResponse.json({
      mode,
      suspects: toProcess.length,
      sample: toProcess.slice(0, 20),
      hint: 'Re-run with ?mode=deactivate / delete / clear-instagram to apply.',
    });
  }

  if (toProcess.length === 0) {
    return NextResponse.json({ mode, affected: 0, message: 'No suspects found.' });
  }

  const handlesList = toProcess.map(r => r.handle);

  if (mode === 'deactivate') {
    const { error } = await client.from('tracked_brands').update({ active: false }).in('handle', handlesList);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mode, affected: handlesList.length, handles: handlesList });
  }
  if (mode === 'delete') {
    const { error } = await client.from('tracked_brands').delete().in('handle', handlesList);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mode, affected: handlesList.length, handles: handlesList });
  }
  if (mode === 'clear-instagram') {
    const { error } = await client.from('tracked_brands').update({ instagram_url: null }).in('handle', handlesList);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mode, affected: handlesList.length, handles: handlesList });
  }

  return NextResponse.json({ error: `Unknown mode "${mode}". Use dryrun|deactivate|delete|clear-instagram.` }, { status: 400 });
}
