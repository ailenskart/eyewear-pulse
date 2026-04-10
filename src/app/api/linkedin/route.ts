import { NextRequest, NextResponse } from 'next/server';
import { runActor, isApifyConfigured, apifySetupInstructions, DEFAULT_ACTORS } from '@/lib/apify';

/**
 * LinkedIn jobs + company intelligence via Apify.
 *
 * Two modes:
 *   GET /api/linkedin?mode=jobs&q=eyewear&location=India
 *     — bebity/linkedin-jobs-scraper
 *
 *   GET /api/linkedin?mode=company&company=lenskart
 *     — curious_coder/linkedin-company-scraper
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('mode') || 'jobs';
  const q = (searchParams.get('q') || '').trim();
  const location = searchParams.get('location') || '';
  const company = (searchParams.get('company') || '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);

  if (!isApifyConfigured()) {
    return NextResponse.json({
      needsSetup: true,
      setupInstructions: apifySetupInstructions(),
    });
  }

  if (mode === 'jobs') {
    if (!q) return NextResponse.json({ error: 'q param required' }, { status: 400 });
    const input = {
      queries: [q],
      locations: location ? [location] : ['Worldwide'],
      count: limit,
      rows: limit,
      proxy: { useApifyProxy: true },
    };
    const result = await runActor(DEFAULT_ACTORS.linkedinJobs, input, { timeout: 55, maxItems: limit });
    if (!result.ok) {
      return NextResponse.json({ jobs: [], error: result.error, actor: result.actor }, { status: 502 });
    }
    const jobs = result.items.map((j: Record<string, unknown>) => ({
      id: j.id as string | undefined,
      title: (j.title as string) || (j.jobTitle as string),
      company: (j.companyName as string) || (j.company as string),
      location: (j.location as string) || (j.jobLocation as string),
      url: (j.jobUrl as string) || (j.url as string),
      postedAt: (j.postedAt as string) || (j.postedDate as string),
      salary: j.salary as string | undefined,
      employmentType: j.employmentType as string | undefined,
      seniorityLevel: j.seniorityLevel as string | undefined,
      description: (j.description as string)?.substring(0, 500),
      applicants: j.applicants as number | undefined,
    }));
    return NextResponse.json({ q, location, total: jobs.length, jobs, source: 'apify', actor: result.actor });
  }

  if (mode === 'company') {
    if (!company) return NextResponse.json({ error: 'company param required' }, { status: 400 });
    const input = {
      startUrls: [{
        url: company.startsWith('http') ? company : `https://www.linkedin.com/company/${company}/`,
      }],
    };
    const result = await runActor(DEFAULT_ACTORS.linkedinCompany, input, { timeout: 55 });
    if (!result.ok) {
      return NextResponse.json({ company: null, error: result.error, actor: result.actor }, { status: 502 });
    }
    const c = (result.items[0] || {}) as Record<string, unknown>;
    return NextResponse.json({
      company: {
        name: (c.name as string) || (c.companyName as string),
        tagline: c.tagline as string | undefined,
        description: (c.description as string)?.substring(0, 800),
        website: (c.website as string) || (c.websiteUrl as string),
        industry: c.industry as string | undefined,
        size: (c.employeeCount as number) || (c.size as string),
        headquarters: (c.headquarters as string) || (c.location as string),
        founded: c.founded as number | undefined,
        specialties: c.specialties as string[] | undefined,
        logo: (c.logoUrl as string) || (c.logo as string),
        followers: (c.followerCount as number) || (c.followers as number),
        url: c.url as string | undefined,
      },
      source: 'apify',
      actor: result.actor,
    });
  }

  return NextResponse.json({ error: 'Invalid mode. Use jobs or company.' }, { status: 400 });
}
