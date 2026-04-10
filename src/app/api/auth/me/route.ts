import { NextRequest, NextResponse } from 'next/server';
import { verifySession, isAuthEnforced, AUTH_COOKIE_NAME } from '@/lib/auth';

/** Returns the current session payload or { authenticated: false }. */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const enforced = isAuthEnforced();
  if (!token) {
    return NextResponse.json({ authenticated: !enforced, enforced });
  }
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ authenticated: !enforced, enforced });
  }
  return NextResponse.json({
    authenticated: true,
    enforced,
    email: session.email,
    name: session.name,
    picture: session.picture,
  });
}
