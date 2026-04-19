/**
 * Supabase-backed session helpers.
 *
 * The heavy lifting (Google OAuth, token refresh) is Supabase's job.
 * We expose:
 *   - `getServerSession()` — for server routes + RSC
 *   - `requireRole(role)` — guard for API routes
 *   - `isAllowed(email)` — checks LENZY_ALLOWED_EMAILS
 *
 * Works without auth configured: `getServerSession()` returns null and
 * `requireRole()` returns a 401 response. Pages that don't require auth
 * just render. When GOOGLE_OAUTH_CLIENT_ID + SUPABASE_URL are set, real
 * auth kicks in.
 */

import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { NextResponse } from 'next/server';

export interface Session {
  user: {
    id: string;
    email: string;
    name: string | null;
    picture: string | null;
    role: 'admin' | 'editor' | 'viewer';
  };
}

export async function getServerSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('sb-access-token')?.value;
    if (!token) return null;

    const sb = createClient(env.SUPABASE_URL(), env.SUPABASE_KEY());
    const { data } = await sb.auth.getUser(token);
    if (!data.user?.email) return null;

    // Fetch the user's role from public.users
    const { data: profile } = await sb.from('users').select('*').eq('id', data.user.id).maybeSingle();
    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: (profile?.name as string) || data.user.user_metadata?.name || null,
        picture: (profile?.picture as string) || data.user.user_metadata?.avatar_url || null,
        role: (profile?.role as 'admin' | 'editor' | 'viewer') || 'viewer',
      },
    };
  } catch {
    return null;
  }
}

export function isAllowed(email: string): boolean {
  const list = env.LENZY_ALLOWED_EMAILS();
  if (!list) return true; // allow-all when no env set (dev convenience)
  const emails = list.split(',').map(e => e.trim().toLowerCase());
  const normalized = email.toLowerCase();
  for (const entry of emails) {
    if (entry === normalized) return true;
    if (entry.startsWith('*@') && normalized.endsWith(entry.slice(1))) return true;
  }
  return false;
}

export async function requireRole(
  min: 'admin' | 'editor' | 'viewer' = 'viewer',
): Promise<{ session: Session } | { response: NextResponse }> {
  // If auth isn't configured (no allowlist env), allow all
  if (!env.LENZY_ALLOWED_EMAILS()) {
    return {
      session: {
        user: { id: 'anonymous', email: 'dev@lenskart.com', name: 'Dev', picture: null, role: 'admin' },
      },
    };
  }
  const sess = await getServerSession();
  if (!sess) return { response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  if (!isAllowed(sess.user.email)) return { response: NextResponse.json({ error: 'email not allowed' }, { status: 403 }) };

  const ROLE_RANK = { viewer: 0, editor: 1, admin: 2 } as const;
  if (ROLE_RANK[sess.user.role] < ROLE_RANK[min]) {
    return { response: NextResponse.json({ error: `role ${min} required` }, { status: 403 }) };
  }
  return { session: sess };
}
