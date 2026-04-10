import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge middleware — gates the app behind Google sign-in when an
 * allowlist is configured.
 *
 * When LENZY_ALLOWED_EMAILS is empty/unset the app is open
 * (default), so initial deployments aren't broken. Once you set
 * the env var, all requests are redirected to /signin unless they
 * have a valid lenzy_session cookie.
 *
 * Note: we can't import the crypto-based verifySession here
 * because middleware runs on the Edge runtime. We only check for
 * cookie presence here — the /api/auth/me route does the real
 * verification and the client-side session check handles it.
 */

const PUBLIC_PATHS = [
  '/signin',
  '/api/auth/google',
  '/api/auth/me',
  '/api/img',
  '/icon',
  '/apple-icon',
  '/opengraph-image',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
];

export function middleware(request: NextRequest) {
  const allowed = (process.env.LENZY_ALLOWED_EMAILS || '').trim();
  if (!allowed) return NextResponse.next(); // auth not enforced

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('lenzy_session')?.value;
  if (token) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/signin';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
