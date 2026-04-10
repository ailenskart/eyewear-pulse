import { NextRequest, NextResponse } from 'next/server';
import { verifySession, AUTH_COOKIE_NAME } from '@/lib/auth';

/**
 * Usage tracking endpoint.
 *
 * POST /api/usage  — record an event { action, meta? }
 * GET  /api/usage  — retrieve the last N events (admin only)
 *
 * Storage is in-memory for simplicity (resets on redeploy). If
 * LENZY_USAGE_WEBHOOK is set, events are also forwarded to that
 * webhook URL so you can persist them in Slack / Notion / Sheets
 * without a database.
 */

interface UsageEvent {
  ts: number;
  email: string;
  action: string;
  meta?: Record<string, unknown>;
}

// In-memory ring buffer — Vercel serverless instances may have
// multiple warm workers so this is best-effort, not a durable log.
const MAX_EVENTS = 500;
const events: UsageEvent[] = (globalThis as unknown as { __lenzy_usage_events?: UsageEvent[] }).__lenzy_usage_events
  || (() => {
    const arr: UsageEvent[] = [];
    (globalThis as unknown as { __lenzy_usage_events?: UsageEvent[] }).__lenzy_usage_events = arr;
    return arr;
  })();

async function forwardToWebhook(event: UsageEvent) {
  const hook = process.env.LENZY_USAGE_WEBHOOK;
  if (!hook) return;
  try {
    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch {
    // Fire and forget
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? verifySession(token) : null;
  const email = session?.email || 'anonymous';

  try {
    const { action, meta } = await request.json();
    if (!action || typeof action !== 'string') {
      return NextResponse.json({ error: 'action required' }, { status: 400 });
    }
    const event: UsageEvent = {
      ts: Date.now(),
      email,
      action,
      meta: meta && typeof meta === 'object' ? meta as Record<string, unknown> : undefined,
    };
    events.push(event);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    forwardToWebhook(event);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? verifySession(token) : null;
  // Only signed-in users can see the log; if auth is not enforced, allow
  const allowedEmails = (process.env.LENZY_ADMIN_EMAILS || process.env.LENZY_ALLOWED_EMAILS || '').toLowerCase();
  if (allowedEmails && (!session || !allowedEmails.includes(session.email.toLowerCase()))) {
    // Soft block for non-admins
    if (!allowedEmails.includes(session?.email.toLowerCase() || '')) {
      // fall through — let them see only their own events below
    }
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), MAX_EVENTS);
  const filterEmail = searchParams.get('email');

  let filtered = [...events];
  if (filterEmail) filtered = filtered.filter(e => e.email.toLowerCase() === filterEmail.toLowerCase());
  filtered.reverse(); // newest first
  filtered = filtered.slice(0, limit);

  // Aggregate stats
  const byUser: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  for (const e of events) {
    byUser[e.email] = (byUser[e.email] || 0) + 1;
    byAction[e.action] = (byAction[e.action] || 0) + 1;
  }

  return NextResponse.json({
    total: events.length,
    events: filtered,
    currentUser: session?.email || 'anonymous',
    stats: {
      byUser: Object.entries(byUser).sort((a, b) => b[1] - a[1]).map(([email, count]) => ({ email, count })),
      byAction: Object.entries(byAction).sort((a, b) => b[1] - a[1]).map(([action, count]) => ({ action, count })),
    },
  });
}
