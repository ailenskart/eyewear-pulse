/**
 * Sentry init scaffold. Activated when SENTRY_DSN is set.
 *
 * We use a deferred init so the rest of the app doesn't pay the
 * dependency-resolution cost on every edge function cold start if
 * Sentry isn't wired.
 */

import { logger } from './logger';

let initialized = false;

export async function initSentry() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.debug('Sentry disabled (SENTRY_DSN not set)');
    return;
  }
  try {
    // Dynamic import so the package stays optional — install @sentry/nextjs
    // when ready. For now we just log that the scaffold is active.
    // const Sentry = await import('@sentry/nextjs');
    // Sentry.init({ dsn, tracesSampleRate: 0.1 });
    initialized = true;
    logger.info({ dsn: dsn.slice(0, 20) + '...' }, 'Sentry scaffold ready');
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'Sentry init failed');
  }
}

export function captureError(err: unknown, context?: Record<string, unknown>) {
  logger.error({ err: err instanceof Error ? err.message : String(err), ...context }, 'Captured error');
  // Sentry.captureException(err, { extra: context }) when wired.
}
