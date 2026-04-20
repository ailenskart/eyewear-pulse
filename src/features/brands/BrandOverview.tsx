'use client';

import * as React from 'react';
import { Card, CardTitle, CardSubtitle } from '@/components/ui/Card';
import { Timeline, TimelineItem } from '@/components/ui/Timeline';
import { Badge } from '@/components/ui/Badge';
import type { BrandProfile } from './types';

function rel(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'now';
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function BrandOverview({ profile }: { profile: BrandProfile }) {
  const timeline = React.useMemo(() => buildTimeline(profile), [profile]);

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6 max-w-6xl mx-auto px-4 py-6">
      {/* Left — timeline + description */}
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight mb-4 text-[var(--ink-muted)] uppercase">
          Recent activity
        </h2>
        {timeline.length > 0 ? (
          <Timeline items={timeline} />
        ) : (
          <div className="text-[13px] text-[var(--ink-muted)] py-8 text-center bg-[var(--surface-2)] rounded-[var(--radius-lg)]">
            No recent activity yet. Scrape cron will populate this.
          </div>
        )}
      </div>

      {/* Right — at-a-glance */}
      <aside className="space-y-4">
        <Card padding="md">
          <CardTitle>At a glance</CardTitle>
          <CardSubtitle>{profile.brand.name}</CardSubtitle>
          <dl className="mt-3 space-y-2 text-[12px]">
            <Row label="HQ"          value={[profile.brand.hq_city, profile.brand.country].filter(Boolean).join(', ') || '—'} />
            <Row label="Founded"     value={profile.brand.founded_year?.toString() || '—'} />
            <Row label="Business"    value={profile.brand.business_type || '—'} />
            <Row label="Model"       value={profile.brand.business_model || '—'} />
            <Row label="Price tier"  value={profile.brand.price_range || '—'} />
            <Row label="Parent"      value={profile.brand.parent_company || '—'} />
            <Row label="Ownership"   value={profile.brand.ownership_type || '—'} />
            <Row label="Employees"   value={profile.brand.employee_count?.toLocaleString() || '—'} />
            <Row label="Stores"      value={profile.brand.store_count?.toLocaleString() || '—'} />
            {profile.brand.tags && profile.brand.tags.length > 0 && (
              <div className="pt-2 border-t border-[var(--border)]">
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-1">Tags</dt>
                <div className="flex flex-wrap gap-1">
                  {profile.brand.tags.map(t => <Badge key={t}>{t}</Badge>)}
                </div>
              </div>
            )}
          </dl>
        </Card>

        <Card padding="md">
          <CardTitle>Socials</CardTitle>
          <div className="mt-2 space-y-1.5 text-[12px]">
            <SocialRow label="Website"   url={profile.brand.website} />
            <SocialRow label="Instagram" url={profile.brand.instagram_url} />
            <SocialRow label="Facebook"  url={profile.brand.facebook_url} />
            <SocialRow label="X"         url={profile.brand.twitter_url} />
            <SocialRow label="TikTok"    url={profile.brand.tiktok_url} />
            <SocialRow label="YouTube"   url={profile.brand.youtube_url} />
            <SocialRow label="LinkedIn"  url={profile.brand.linkedin_url} />
          </div>
        </Card>

        {profile.competitors.length > 0 && (
          <Card padding="md">
            <CardTitle>Competitors</CardTitle>
            <CardSubtitle>Same category · {profile.brand.region}</CardSubtitle>
            <div className="mt-3 space-y-2">
              {profile.competitors.map(c => (
                <a key={c.id} href={`/brands/${c.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius)] hover:bg-[var(--surface-2)] transition-colors">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt="" className="w-7 h-7 rounded object-cover bg-[var(--surface-2)]" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-7 h-7 rounded bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-[11px] font-semibold">{c.name.charAt(0)}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-[var(--ink-muted)] truncate">@{c.handle} · {c.instagram_followers ? format(c.instagram_followers) : '—'} followers</div>
                  </div>
                </a>
              ))}
            </div>
          </Card>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-[var(--ink-soft)] w-20 flex-shrink-0">{label}</dt>
      <dd className="text-[var(--ink)] flex-1 min-w-0 truncate">{value}</dd>
    </div>
  );
}

function SocialRow({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-[var(--ink-soft)] w-20 flex-shrink-0">{label}</dt>
      <dd className="flex-1 min-w-0 truncate">
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">{url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a> : <span className="text-[var(--ink-soft)]">—</span>}
      </dd>
    </div>
  );
}

function format(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function buildTimeline(profile: BrandProfile): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const p of profile.posts.slice(0, 8)) {
    items.push({
      id: `post-${p.id}`,
      icon: '⧉',
      type: 'Instagram post',
      title: (p.caption || '').slice(0, 120) || 'Post',
      description: `${(p.likes || 0).toLocaleString()} likes · ${(p.comments || 0).toLocaleString()} comments`,
      when: p.posted_at ? rel(p.posted_at) : rel(p.detected_at),
      href: p.url || undefined,
    });
  }
  for (const p of profile.products.slice(0, 5)) {
    items.push({
      id: `product-${p.id}`,
      icon: '◘',
      type: 'Product',
      title: p.title || 'Product',
      description: p.price ? `${p.currency === 'EUR' ? '€' : p.currency === 'GBP' ? '£' : p.currency === 'INR' ? '₹' : '$'}${p.price}` : undefined,
      when: p.posted_at ? rel(p.posted_at) : rel(p.detected_at),
      href: p.url || undefined,
    });
  }
  for (const r of profile.reimagines.slice(0, 3)) {
    items.push({
      id: `reimagine-${r.id}`,
      icon: '◈',
      type: 'Reimagine',
      title: r.title || 'Lenskart-branded variant',
      when: rel(r.detected_at),
    });
  }
  items.sort((a, b) => {
    // Rough "recent first" — items with "now"/"Xh ago" come before "Xd ago"/"Xmo ago"
    const score = (w: string) => w.includes('h') ? 0 : w.includes('d') ? 1 : w.includes('mo') ? 2 : w.includes('y') ? 3 : 0;
    return score(a.when) - score(b.when);
  });
  return items.slice(0, 20);
}
