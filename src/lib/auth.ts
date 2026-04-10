/**
 * Minimal Google OAuth session helpers.
 *
 * We keep this deliberately simple — no NextAuth / Auth.js
 * dependency. The flow:
 *   1. Client loads Google Identity Services (GSI) button
 *   2. Google returns an ID token (JWT) after consent
 *   3. /api/auth/google verifies the JWT via Google's tokeninfo
 *      endpoint, checks the email against LENZY_ALLOWED_EMAILS,
 *      and sets a signed HttpOnly cookie
 *   4. Middleware reads the cookie on every request and redirects
 *      unauthenticated users to the sign-in page
 *
 * When LENZY_ALLOWED_EMAILS is empty/unset the app is open (dev
 * mode) so initial deploys aren't blocked.
 */

import crypto from 'crypto';

const COOKIE_NAME = 'lenzy_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface LenzySession {
  email: string;
  name?: string;
  picture?: string;
  iat: number;
  exp: number;
}

function secret(): string {
  return process.env.LENZY_AUTH_SECRET || 'dev-insecure-change-me-in-production';
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Buffer {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

/** Sign a session payload into a compact token (like a tiny JWT). */
export function signSession(payload: Omit<LenzySession, 'iat' | 'exp'>): string {
  const full: LenzySession = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE,
  };
  const body = base64url(Buffer.from(JSON.stringify(full)));
  const sig = base64url(
    crypto.createHmac('sha256', secret()).update(body).digest()
  );
  return `${body}.${sig}`;
}

/** Verify a session token. Returns the payload or null. */
export function verifySession(token: string): LenzySession | null {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = base64url(
      crypto.createHmac('sha256', secret()).update(body).digest()
    );
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload: LenzySession = JSON.parse(base64urlDecode(body).toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAllowedEmails(): string[] {
  const raw = process.env.LENZY_ALLOWED_EMAILS || '';
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** True if auth is configured (has an allowlist). Otherwise app is open. */
export function isAuthEnforced(): boolean {
  return getAllowedEmails().length > 0;
}

/** Check if an email is allowed. Supports @domain.com wildcards. */
export function isEmailAllowed(email: string): boolean {
  if (!email) return false;
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return true; // no allowlist = open app
  const lower = email.toLowerCase();
  for (const entry of allowed) {
    if (entry === lower) return true;
    if (entry.startsWith('@') && lower.endsWith(entry)) return true;
  }
  return false;
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
export const AUTH_COOKIE_MAX_AGE = COOKIE_MAX_AGE;
