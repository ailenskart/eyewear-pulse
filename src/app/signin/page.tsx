'use client';
import { useEffect, useState } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
    handleGoogleCredential?: (response: { credential: string }) => void;
  }
}

export default function SignInPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  useEffect(() => {
    if (!clientId) return;

    const handleCredential = async (response: { credential: string }) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Sign-in failed');
          setLoading(false);
          return;
        }
        const next = new URLSearchParams(window.location.search).get('next') || '/';
        window.location.href = next;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
        setLoading(false);
      }
    };

    window.handleGoogleCredential = handleCredential;

    const init = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
      });
      const btnContainer = document.getElementById('google-signin-button');
      if (btnContainer) {
        window.google.accounts.id.renderButton(btnContainer, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'left',
          width: 280,
        });
      }
    };

    if (window.google) init();
    else {
      const check = setInterval(() => {
        if (window.google) {
          clearInterval(check);
          init();
        }
      }, 100);
      return () => clearInterval(check);
    }
  }, [clientId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-6">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      <div className="w-full max-w-sm text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-purple-500 flex items-center justify-center text-white text-3xl font-bold mb-6">L</div>
        <h1 className="text-[28px] font-bold tracking-tight">Welcome to Lenzy</h1>
        <p className="text-[13px] text-[var(--text-2)] mt-2 leading-relaxed">
          Sign in with your company Google account to access the eyewear intelligence dashboard.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          {clientId ? (
            <div id="google-signin-button"></div>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--brand)] rounded-xl p-4 text-left">
              <div className="text-[13px] font-semibold mb-2">Google sign-in not configured</div>
              <p className="text-[11px] text-[var(--text-2)] leading-relaxed mb-2">
                Set these env vars in Vercel:
              </p>
              <ul className="text-[11px] text-[var(--text-2)] list-disc list-inside space-y-1">
                <li><code className="bg-[var(--bg-alt)] px-1 rounded">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> — OAuth client ID</li>
                <li><code className="bg-[var(--bg-alt)] px-1 rounded">GOOGLE_CLIENT_ID</code> — same value (server verify)</li>
                <li><code className="bg-[var(--bg-alt)] px-1 rounded">LENZY_ALLOWED_EMAILS</code> — comma list: <code>@lenskart.com,you@gmail.com</code></li>
                <li><code className="bg-[var(--bg-alt)] px-1 rounded">LENZY_AUTH_SECRET</code> — random 32+ char string</li>
              </ul>
              <p className="text-[11px] text-[var(--text-3)] mt-2">Once set, only allowed emails can access Lenzy.</p>
            </div>
          )}

          {loading && <div className="text-[12px] text-[var(--text-3)]">Signing in…</div>}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] w-full text-left">{error}</div>
          )}
        </div>

        <p className="text-[10px] text-[var(--text-3)] mt-10 leading-relaxed">
          Internal use only. All activity is logged for usage analytics.
        </p>
      </div>
    </div>
  );
}
