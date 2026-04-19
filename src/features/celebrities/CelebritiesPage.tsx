'use client';

import * as React from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

interface CelebPost {
  id: string;
  celebName: string;
  celebCategory: string | null;
  celebCountry: string | null;
  imageUrl: string;
  thumbnail?: string;
  eyewearType: string;
  sourceLabel: string;
  pageUrl: string;
  likes: number;
  postedAt: string;
}

export function CelebritiesPage() {
  const [posts, setPosts] = React.useState<CelebPost[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [category, setCategory] = React.useState('All');
  const [eyewearType, setEyewearType] = React.useState('');
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '60' });
    if (category !== 'All') p.set('category', category);
    if (search) p.set('search', search);
    if (eyewearType) p.set('eyewearType', eyewearType);
    fetch(`/api/celebrities/feed?${p}`).then(r => r.json()).then(d => { setPosts(d.posts || []); setLoading(false); });
  }, [category, eyewearType, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Celebrities</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            Vision-approved celebrity eyewear moments · cross-attributed to brands
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Input
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
          placeholder="Search celebs, eyewear types…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[240px]"
        />
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="All">All categories</option>
          <option value="Actor">Actor</option>
          <option value="Musician">Musician</option>
          <option value="Athlete">Athlete</option>
          <option value="Influencer">Influencer</option>
        </Select>
        <Select value={eyewearType} onChange={(e) => setEyewearType(e.target.value)}>
          <option value="">All frames</option>
          <option value="sunglasses">Sunglasses</option>
          <option value="eyeglasses">Eyeglasses</option>
        </Select>
      </div>

      {loading && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="aspect-square" />)}</div>}

      {!loading && posts.length === 0 && (
        <EmptyState
          title="No celebrity photos yet"
          description="The celebrity cron will populate this as it scans Instagram accounts."
        />
      )}

      {posts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {posts.map(p => (
            <MediaCard
              key={p.id}
              image={p.imageUrl}
              aspect="square"
              title={p.celebName}
              subtitle={p.eyewearType}
              href={p.pageUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}
