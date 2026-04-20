'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandHeader } from './BrandHeader';
import { BrandTabs, BrandTab } from './BrandTabs';
import { BrandOverview } from './BrandOverview';
import { BrandPosts } from './BrandPosts';
import { BrandProducts } from './BrandProducts';
import { BrandPeople } from './BrandPeople';
import { BrandNews } from './BrandNews';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { MediaCard } from '@/components/ui/MediaCard';
import { Badge } from '@/components/ui/Badge';
import type { BrandProfile } from './types';

interface BrandDetailProps {
  brandId?: number;
  brandHandle?: string;
}

export function BrandDetailClient({ brandId, brandHandle }: BrandDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') || 'overview') as BrandTab;
  const [tab, setTab] = React.useState<BrandTab>(initialTab);
  const [profile, setProfile] = React.useState<BrandProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [resolvedBrandId, setResolvedBrandId] = React.useState<number | null>(brandId ?? null);

  React.useEffect(() => {
    setLoading(true);
    // Build the API URL — support both id and handle lookup
    const params = brandId ? `id=${brandId}` : `handle=${brandHandle}`;
    fetch(`/api/v1/brands/profile?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); }
        else {
          setProfile(data);
          // Store the resolved numeric brand ID for sub-components
          if (data.brand?.id) setResolvedBrandId(data.brand.id);
        }
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [brandId, brandHandle]);

  const onTabChange = (t: BrandTab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === 'overview') url.searchParams.delete('tab'); else url.searchParams.set('tab', t);
    window.history.replaceState({}, '', url.toString());
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <Skeleton className="h-24" />
      <Skeleton className="h-12" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    </div>;
  }
  if (error || !profile) {
    return <div className="max-w-6xl mx-auto px-4 py-12">
      <EmptyState
        title="Brand not found"
        description={error || 'Try searching from the Brands directory.'}
        action={<button onClick={() => router.push('/brands')} className="text-[13px] text-[var(--accent)] font-semibold">Back to Brands →</button>}
      />
    </div>;
  }

  const effectiveBrandId = resolvedBrandId ?? 0;

  return (
    <div>
      <BrandHeader brand={profile.brand} />
      <BrandTabs active={tab} counts={profile.counts.by_type} onChange={onTabChange} />

      <div className="min-h-[50vh]">
        {tab === 'overview'   && <BrandOverview profile={profile} />}
        {tab === 'posts'      && <BrandPosts items={profile.posts} />}
        {tab === 'products'   && <BrandProducts items={profile.products} />}
        {tab === 'people'     && <BrandPeople items={profile.people} />}
        {tab === 'celebs'     && <CelebsTab items={profile.celebs} />}
        {tab === 'reimagines' && <ReimaginesTab items={profile.reimagines} />}
        {tab === 'links'      && <LinksTab brandId={effectiveBrandId} />}
        {tab === 'news'       && <BrandNews brandId={effectiveBrandId} />}
        {tab === 'compare'    && <CompareTab brandId={effectiveBrandId} />}
      </div>
    </div>
  );
}

function CelebsTab({ items }: { items: BrandProfile['celebs'] }) {
  if (items.length === 0) return <div className="max-w-6xl mx-auto px-4 py-8">
    <EmptyState title="No celebrities spotted yet" description="The Vision pipeline will surface matches as it scans unbranded photos." />
  </div>;
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(c => (
          <MediaCard
            key={c.id}
            image={c.blob_url || c.image_url || ''}
            aspect="square"
            title={c.person_name}
            subtitle={c.eyewear_type || undefined}
            href={c.url || undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ReimaginesTab({ items }: { items: BrandProfile['reimagines'] }) {
  if (items.length === 0) return <div className="max-w-6xl mx-auto px-4 py-8">
    <EmptyState
      title="No reimagines yet"
      description="Pick any post and hit Reimagine to generate Lenskart-branded variants."
      action={<a href="/reimagine" className="text-[13px] text-[var(--accent)] font-semibold">Open Reimagine Studio →</a>}
    />
  </div>;
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(r => (
          <MediaCard
            key={r.id}
            image={r.blob_url || r.image_url || ''}
            aspect="square"
            title={r.title}
            subtitle={(r.data?.model as string) || undefined}
          />
        ))}
      </div>
    </div>
  );
}

function LinksTab({ brandId }: { brandId: number }) {
  const [links, setLinks] = React.useState<Array<Record<string, unknown>> | null>(null);
  React.useEffect(() => {
    fetch(`/api/content?brand_id=${brandId}&type=website_link&limit=200`)
      .then(r => r.json())
      .then(d => setLinks(d.content || []));
  }, [brandId]);
  if (!links) return <div className="max-w-6xl mx-auto px-4 py-6"><Skeleton className="h-64" /></div>;
  if (links.length === 0) return <div className="max-w-6xl mx-auto px-4 py-8">
    <EmptyState title="No links yet" description="Sitemaps and URLs will appear here once scraped." />
  </div>;
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <Card padding="none">
        <ul className="divide-y divide-[var(--border)]">
          {links.slice(0, 100).map((l, i) => {
            const row = l as { id: number; url: string; title: string | null; data: Record<string, unknown> | null };
            const kind = (row.data?.link_kind as string) || 'link';
            return (
              <li key={row.id || i} className="px-4 py-2 hover:bg-[var(--surface-2)] transition-colors">
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-[12px]">
                  <Badge size="xs">{kind}</Badge>
                  <span className="font-medium text-[var(--ink)]">{row.title || 'Untitled'}</span>
                  <span className="text-[var(--ink-muted)] truncate">{row.url?.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function CompareTab({ brandId }: { brandId: number }) {
  const [otherId, setOtherId] = React.useState<string>('');
  const [data, setData] = React.useState<{ items: Array<{ brand: Record<string, unknown>; counts: Record<string, unknown>; engagement: Record<string, unknown> }> } | null>(null);
  const [loading, setLoading] = React.useState(false);

  const runCompare = () => {
    if (!otherId.trim()) return;
    setLoading(true);
    fetch(`/api/v1/brands/compare?ids=${brandId},${otherId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={otherId}
          onChange={(e) => setOtherId(e.target.value.replace(/\D/g, ''))}
          placeholder="Brand ID to compare"
          className="flex-1 h-9 px-3 rounded-[var(--radius)] bg-[var(--surface-2)] border border-transparent focus:border-[var(--accent)] outline-none text-[13px]"
        />
        <button onClick={runCompare} disabled={!otherId.trim() || loading} className="h-9 px-4 rounded-[var(--radius)] bg-[var(--accent)] text-[var(--accent-ink)] text-[13px] font-semibold disabled:opacity-50">
          Compare
        </button>
      </div>
      {data && data.items && (
        <div className="grid grid-cols-2 gap-3">
          {data.items.map((it, i) => (
            <Card key={i} padding="md">
              <div className="text-[14px] font-semibold mb-2">{(it.brand.name as string)}</div>
              <dl className="space-y-1 text-[12px]">
                <div className="flex justify-between"><dt>Category</dt><dd>{(it.brand.category as string) || '—'}</dd></div>
                <div className="flex justify-between"><dt>Region</dt><dd>{(it.brand.region as string) || '—'}</dd></div>
                <div className="flex justify-between"><dt>Followers</dt><dd>{Number(it.brand.instagram_followers || 0).toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt>Employees</dt><dd>{Number(it.brand.employee_count || 0).toLocaleString() || '—'}</dd></div>
                <div className="flex justify-between"><dt>Stores</dt><dd>{Number(it.brand.store_count || 0).toLocaleString() || '—'}</dd></div>
                <div className="flex justify-between"><dt>Total content</dt><dd>{Number(it.counts.total_content || 0).toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt>Avg likes/post</dt><dd>{Number(it.engagement.avg_likes_per_post || 0).toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt>Posts 30d</dt><dd>{Number(it.engagement.posts_last_30d || 0)}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
