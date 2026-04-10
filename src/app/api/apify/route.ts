import { NextRequest, NextResponse } from 'next/server';
import { runActor, isApifyConfigured, apifySetupInstructions, DEFAULT_ACTORS } from '@/lib/apify';

/**
 * Generic Apify bridge.
 *
 * Lets the UI run any Apify actor with unified auth + error handling.
 *
 *   POST /api/apify
 *   { actor: 'apify/instagram-scraper', input: {...}, options: {...} }
 *
 *   GET /api/apify          → returns known actor IDs + setup status
 */

export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    configured: isApifyConfigured(),
    actors: DEFAULT_ACTORS,
    setupInstructions: isApifyConfigured() ? null : apifySetupInstructions(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { actor, input, options } = body;
    if (!actor || typeof actor !== 'string') {
      return NextResponse.json({ error: 'actor (actor ID) required' }, { status: 400 });
    }
    const result = await runActor(actor, input || {}, options || {});
    if (!result.ok) {
      return NextResponse.json({
        error: result.error,
        actor: result.actor,
        needsSetup: result.needsSetup,
        setupInstructions: result.needsSetup ? apifySetupInstructions() : undefined,
      }, { status: result.needsSetup ? 200 : 502 });
    }
    return NextResponse.json({
      actor: result.actor,
      total: result.items.length,
      items: result.items,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Request failed',
    }, { status: 500 });
  }
}
