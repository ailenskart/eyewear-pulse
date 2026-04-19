/**
 * Shared helpers for API route handlers.
 *
 * - withHandler: wraps a handler with structured error handling + logging
 * - ok / fail: consistent JSON response helpers
 * - validateQuery / validateBody: Zod-based validation shortcuts
 * - extractIp: gets the client IP for rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema } from 'zod';
import { loggerFor } from './logger';
import { captureError } from './sentry';

export interface OkResponseOptions {
  status?: number;
  headers?: Record<string, string>;
}

export function ok<T>(data: T, opts: OkResponseOptions = {}): NextResponse {
  return NextResponse.json(data, { status: opts.status ?? 200, headers: opts.headers });
}

export function fail(message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, details }, { status });
}

export function extractIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function validateBody<T>(request: NextRequest, schema: ZodSchema<T>): Promise<
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }
> {
  try {
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, response: fail('Invalid body', 400, parsed.error.flatten()) };
    }
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, response: fail('Body must be valid JSON', 400) };
  }
}

export function validateQuery<T>(request: NextRequest, schema: ZodSchema<T>):
  | { ok: true; data: T }
  | { ok: false; response: NextResponse } {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((v, k) => { params[k] = v; });
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, response: fail('Invalid query', 400, parsed.error.flatten()) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * withHandler wraps an async route handler with:
 *  - scoped logger
 *  - error → 500 with captureError
 *  - timing
 */
export function withHandler(
  scope: string,
  fn: (request: NextRequest, ctx: { log: ReturnType<typeof loggerFor> }) => Promise<NextResponse>,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const log = loggerFor(scope);
    const start = Date.now();
    try {
      const res = await fn(request, { log });
      log.debug({ status: res.status, ms: Date.now() - start, path: request.nextUrl.pathname }, 'handled');
      return res;
    } catch (err) {
      captureError(err, { scope, path: request.nextUrl.pathname });
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'handler error');
      return fail('Internal error', 500);
    }
  };
}
