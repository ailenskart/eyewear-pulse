import { NextRequest, NextResponse } from 'next/server';
import { signSession, isEmailAllowed, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from '@/lib/auth';

/**
 * Google Identity Services (GSI) callback.
 *
 * Client POSTs a credential (Google ID token JWT) from the
 * Sign-in-with-Google button. We verify it via Google's public
 * tokeninfo endpoint (stateless, free, no SDK needed), check the
 * email against LENZY_ALLOWED_EMAILS, and set a signed HttpOnly
 * cookie.
 */

interface GoogleTokenInfo {
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
  aud?: string;
  exp?: string;
  error?: string;
  error_description?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { credential } = await request.json();
    if (!credential) return NextResponse.json({ error: 'credential required' }, { status: 400 });

    // Verify the ID token with Google's public endpoint
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!res.ok) return NextResponse.json({ error: 'Invalid Google token' }, { status: 401 });
    const info: GoogleTokenInfo = await res.json();
    if (info.error) return NextResponse.json({ error: info.error_description || info.error }, { status: 401 });

    if (info.email_verified !== 'true' || !info.email) {
      return NextResponse.json({ error: 'Email not verified by Google' }, { status: 401 });
    }

    // Optional extra check: verify audience matches our client ID
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (expectedAud && info.aud !== expectedAud) {
      return NextResponse.json({ error: 'Token audience mismatch' }, { status: 401 });
    }

    if (!isEmailAllowed(info.email)) {
      return NextResponse.json({
        error: `Access denied for ${info.email}. Contact your Lenzy admin to be added to the allowlist.`,
      }, { status: 403 });
    }

    const token = signSession({
      email: info.email,
      name: info.name,
      picture: info.picture,
    });

    const response = NextResponse.json({ ok: true, email: info.email, name: info.name });
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE,
    });
    return response;
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Auth failed',
    }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
