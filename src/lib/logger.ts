/**
 * Structured logging via pino.
 *
 * Replace every `console.log` / `console.error` with the matching logger
 * method. In production (NODE_ENV=production) logs are JSON and ingested
 * by Vercel Log Drains. In development they're pretty-printed.
 */

import pino, { Logger } from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  base: {
    app: 'lenzy',
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Pretty-print only in dev; production gets structured JSON
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,app,env',
          },
        },
      }),
});

/** Convenience factory for tagged child loggers (per route, per cron). */
export function loggerFor(scope: string): Logger {
  return logger.child({ scope });
}
