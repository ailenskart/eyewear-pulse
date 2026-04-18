import { NextRequest, NextResponse } from 'next/server';
import { runActor, isApifyConfigured, DEFAULT_ACTORS } from '@/lib/apify';
import { supabaseServer } from '@/lib/supabase';

/**
 * Scan a brand's LinkedIn company page for their people via Apify.
 *
 * Takes the brand's LinkedIn URL (from tracked_brands.linkedin_url) and
 * runs the linkedin-company-scraper actor to extract the employee list.
 * Writes the result back to tracked_brands.people (jsonb array) and
 * logs every scan to brand_people_scan_log for audit.
 *
 * Usage:
 *   POST /api/brands/scrape-people
 *   Body: { handle: "rayban" }               use stored linkedin_url
 *   Body: { handle: "rayban", url: "..." }   override URL for this run
 *   POST /api/brands/scrape-people?dryRun=1  preview without writing
 */

export const maxDuration = 60;

interface Person {
  name: string;
  title: string;
  linkedin_url: string | null;
  photo_url: string | null;
  tenure: string | null;
  location: string | null;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
  }

  const handle = String(body.handle || '').trim().toLowerCase();
  if (!handle) return NextResponse.json({ error: 'handle is required in body' }, { status: 400 });

  if (!isApifyConfigured()) {
    return NextResponse.json({
      error: 'APIFY_TOKEN not set. Add it in Vercel env vars to enable LinkedIn people scraping.',
    }, { status: 400 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const client = supabaseServer();

  // Fetch brand to get stored LinkedIn URL if not provided in body
  const { data: brand } = await client
    .from('tracked_brands')
    .select('handle,name,linkedin_url')
    .eq('handle', handle)
    .maybeSingle();

  if (!brand) return NextResponse.json({ error: `Brand @${handle} not found in tracked_brands.` }, { status: 404 });

  const linkedinUrl = String(body.url || brand.linkedin_url || '').trim();
  if (!linkedinUrl) {
    return NextResponse.json({
      error: `@${handle} has no linkedin_url on file. Pass { handle, url } or update the brand first.`,
    }, { status: 400 });
  }
  if (!/linkedin\.com\/company\//i.test(linkedinUrl)) {
    return NextResponse.json({
      error: 'URL must be a LinkedIn company page (linkedin.com/company/...).',
    }, { status: 400 });
  }

  // Run Apify LinkedIn company scraper
  const result = await runActor<Record<string, unknown>>(DEFAULT_ACTORS.linkedinCompany, {
    urls: [linkedinUrl],
    maxEmployees: 50,
    proxy: { useApifyProxy: true },
  }, { timeout: 55, maxItems: 50 });

  if (!result.ok) {
    await client.from('brand_people_scan_log').insert({
      brand_handle: handle,
      linkedin_url: linkedinUrl,
      people_found: 0,
      error: result.error,
    });
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Normalize scraper output into our Person shape
  const people: Person[] = result.items
    .filter(p => p.name || p.fullName)
    .map(p => ({
      name: String(p.name || p.fullName || '').trim(),
      title: String(p.title || p.headline || p.jobTitle || '').trim(),
      linkedin_url: (p.profileUrl || p.url || p.linkedinUrl) ? String(p.profileUrl || p.url || p.linkedinUrl) : null,
      photo_url: (p.photoUrl || p.profilePicture || p.image) ? String(p.photoUrl || p.profilePicture || p.image) : null,
      tenure: p.tenure ? String(p.tenure) : (p.yearsAtCompany ? `${p.yearsAtCompany}y` : null),
      location: p.location ? String(p.location) : null,
    }))
    .filter(p => p.name);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      handle,
      linkedinUrl,
      peopleFound: people.length,
      sample: people.slice(0, 5),
    });
  }

  // Write back to the brand + log the scan
  const nowIso = new Date().toISOString();
  await client
    .from('tracked_brands')
    .update({ people, people_updated_at: nowIso })
    .eq('handle', handle);

  await client.from('brand_people_scan_log').insert({
    brand_handle: handle,
    linkedin_url: linkedinUrl,
    people_found: people.length,
  });

  return NextResponse.json({
    success: true,
    handle,
    linkedinUrl,
    peopleFound: people.length,
    people,
    scannedAt: nowIso,
  });
}
