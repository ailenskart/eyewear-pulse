'use client';
import { useState } from 'react';

interface Tier {
  name: string;
  monthly: number;
  annual: number;
  tagline: string;
  cta: string;
  highlight?: boolean;
  seats: string;
  features: string[];
}

const TIERS: Tier[] = [
  {
    name: 'Basic',
    monthly: 49,
    annual: 39,
    tagline: 'For solo brand managers who want to watch the market.',
    cta: 'Start free trial',
    seats: '1 seat',
    features: [
      'Live feed of 500+ eyewear brands on Instagram',
      'Full product catalog across 45 brands (21k+ SKUs)',
      'Up to 10 reimagines / month',
      'Save to 1 board, up to 50 items',
      'Basic AI briefs (5 / month)',
      'Download any image',
      'Shareable product deep links',
    ],
  },
  {
    name: 'Studio',
    monthly: 149,
    annual: 119,
    tagline: 'For in-house creative teams producing weekly content.',
    cta: 'Start free trial',
    highlight: true,
    seats: '5 seats',
    features: [
      'Everything in Basic',
      'Unlimited reimagines',
      'Unlimited boards with per-item ratings + notes',
      'Unlimited AI creative briefs',
      'Upload your own frame photos for swap',
      'Reimagine iteration history',
      'Competitor watchlist (up to 15 brands)',
      'Priority FLUX Kontext queue',
    ],
  },
  {
    name: 'Agency',
    monthly: 389,
    annual: 319,
    tagline: 'For agencies managing multiple eyewear clients.',
    cta: 'Start free trial',
    seats: '10 seats',
    features: [
      'Everything in Studio',
      'Unlimited competitor watchlist',
      'Client workspaces with white-label share links',
      'API access (10k calls / month)',
      'Team collaboration — tags, comments, assignments',
      'Export boards as PDF mood boards',
      'SLA + priority support',
    ],
  },
  {
    name: 'Enterprise',
    monthly: 0,
    annual: 0,
    tagline: 'For brands with their own catalog and infra needs.',
    cta: 'Talk to sales',
    seats: 'Unlimited',
    features: [
      'Everything in Agency',
      'Custom catalog sync (Shopify, Lenskart, Magento)',
      'Dedicated Reimagine cluster',
      'Single sign-on (SAML / Okta / Google)',
      'Custom retention + data residency',
      'Onboarding + training',
      'Dedicated customer success',
    ],
  },
];

export default function PricingPage() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');

  return (
    <div className="min-h-screen bg-[var(--bg)]" style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--bg)] border-b border-[var(--line)]" style={{ backdropFilter: 'blur(20px)', background: 'color-mix(in srgb, var(--bg) 90%, transparent)' }}>
        <div className="max-w-5xl mx-auto flex items-center h-12 px-4 gap-3">
          <a href="/" className="text-[var(--text-2)] hover:text-[var(--text)]">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </a>
          <h1 className="text-[15px] font-semibold flex-1">Pricing</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-block mb-3 text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--brand)]">Lenzy · lenzy.studio</div>
          <h2 className="text-[32px] sm:text-[44px] font-bold leading-[1.1] tracking-tight">
            The creative AI for <br className="hidden sm:block" />eyewear brands.
          </h2>
          <p className="mt-4 text-[14px] sm:text-[16px] text-[var(--text-2)] max-w-xl mx-auto leading-relaxed">
            See every competitor&apos;s Instagram, build boards of what&apos;s working, and reimagine any post with your own frames in one tap.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-[var(--bg-alt)] rounded-full p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-full text-[12px] font-semibold transition-colors ${billing === 'monthly' ? 'bg-[var(--surface)] shadow-sm' : 'text-[var(--text-3)]'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`px-5 py-2 rounded-full text-[12px] font-semibold transition-colors flex items-center gap-2 ${billing === 'annual' ? 'bg-[var(--surface)] shadow-sm' : 'text-[var(--text-3)]'}`}
            >
              Annual
              <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--brand)] bg-[var(--brand)]/10 px-1.5 py-0.5 rounded">-20%</span>
            </button>
          </div>
        </div>

        {/* Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((t, i) => (
            <div
              key={t.name}
              className={`rounded-2xl p-5 border flex flex-col ${t.highlight ? 'bg-[var(--surface)] border-[var(--brand)] shadow-lg ring-1 ring-[var(--brand)]/30' : 'bg-[var(--surface)] border-[var(--line)]'}`}
              style={{ animation: `up 0.4s ease ${i * 60}ms both` }}
            >
              {t.highlight && (
                <div className="text-[9px] uppercase tracking-[0.1em] font-bold text-[var(--brand)] mb-2">Most popular</div>
              )}
              <div className="text-[16px] font-bold">{t.name}</div>
              <div className="text-[11px] text-[var(--text-3)] mt-0.5">{t.seats}</div>
              <div className="mt-3">
                {t.monthly === 0 ? (
                  <div className="text-[24px] font-bold">Custom</div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[28px] font-bold">${billing === 'annual' ? t.annual : t.monthly}</span>
                      <span className="text-[12px] text-[var(--text-3)]">/ mo</span>
                    </div>
                    {billing === 'annual' && (
                      <div className="text-[10px] text-[var(--text-3)] mt-0.5">billed yearly · ${t.annual * 12}/yr</div>
                    )}
                  </>
                )}
              </div>
              <p className="mt-3 text-[12px] text-[var(--text-2)] leading-relaxed min-h-[36px]">{t.tagline}</p>
              <button className={`mt-4 py-2.5 rounded-lg text-[12px] font-semibold ${t.highlight ? 'bg-[var(--brand)] text-white hover:opacity-90' : 'bg-[var(--bg-alt)] text-[var(--text)] hover:bg-[var(--line)]'}`}>
                {t.cta}
              </button>

              <ul className="mt-5 space-y-2">
                {t.features.map((f, fi) => (
                  <li key={fi} className="flex gap-2 text-[12px] text-[var(--text-2)] leading-snug">
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-[var(--brand)] flex-shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto">
          <h3 className="text-[20px] font-bold text-center mb-6">Frequently asked questions</h3>
          <div className="space-y-3">
            {[
              { q: 'How is Lenzy different from Foreplay or Motion?', a: 'Those tools are horizontal ad intelligence for every vertical. Lenzy is a vertical product built only for eyewear brands — with a live Instagram feed of 500+ eyewear accounts, a product catalog of 45 brands, and an image-to-image Reimagine engine that actually swaps your frames onto competitor posts (not just a text brief).' },
              { q: 'What is a "reimagine"?', a: 'Pick any post from the feed (or upload your own), then either paste a Lenskart product URL or upload a photo of target frames. Lenzy analyses both and uses FLUX Kontext to produce an edited version of the original post with your frames on the same model, in the same pose and lighting — while keeping their ethnicity and identity locked. Output is a ready-to-post 1:1 image.' },
              { q: 'Can I use my own product catalog?', a: 'Enterprise plans sync directly from your Shopify / Lenskart / Magento store. Other plans use our curated 45-brand catalog. Upload a frame photo on any plan to reimagine with a specific product.' },
              { q: 'What does "priority Reimagine queue" mean?', a: 'Studio and above get dedicated FLUX Kontext capacity so your edits run in under 30s even when the free pool is congested.' },
              { q: 'Is there a free trial?', a: 'Yes — 7 days on every plan, no credit card required for the Basic tier. Cancel any time.' },
            ].map((f, i) => (
              <details key={i} className="bg-[var(--surface)] border border-[var(--line)] rounded-xl px-4 py-3 group">
                <summary className="text-[13px] font-semibold cursor-pointer list-none flex justify-between items-center">
                  {f.q}
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-[var(--text-3)] group-open:rotate-180 transition-transform"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <p className="mt-2 text-[12px] text-[var(--text-2)] leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-16 text-center">
          <p className="text-[13px] text-[var(--text-3)]">
            Questions? <a href="mailto:hello@lenzy.studio" className="text-[var(--brand)] font-semibold">hello@lenzy.studio</a>
          </p>
        </div>
      </main>
    </div>
  );
}
