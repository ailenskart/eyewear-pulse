'use client';

import * as React from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

interface Post {
  id: string;
  brand: { name: string; handle: string; category: string };
  imageUrl: string;
  caption: string;
  likes: number;
  comments: number;
  postedAt: string;
  postUrl: string;
  isVideo: boolean;
}

interface FeedData {
  posts: Post[];
  total: number;
  page: number;
  totalPages: number;
  lastUpdated: { tier: string; ran_at: string; new_posts: number } | null;
}

function rel(d: string): string {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000);
  if (h < 1) return 'now';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

const CATEGORIES = ['All', 'D2C', 'Luxury', 'Sports', 'Independent', 'Fast Fashion', 'Streetwear', 'Heritage', 'Tech'];

export function FeedPage() {
  const [data, setData] = React.useState<FeedData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [cat, setCat] = React.useState('All');
  const [sort, setSort] = React.useState<'recent' | 'likes' | 'engagement' | 'shuffle'>('recent');

  React.useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({
      category: cat, sortBy: sort, search, page: '1', limit: '40',
      _: String(Date.now()),
    });
    fetch(`/api/feed?${p}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [cat, sort, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Feed</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            {data?.lastUpdated
              ? `Updated ${rel(data.lastUpdated.ran_at)} · ${data.lastUpdated.new_posts > 0 ? '+' + data.lastUpdated.new_posts + ' new' : 'no new'} · ${data.lastUpdated.tier}`
              : 'Loading latest posts from every tracked brand…'}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => fetch('/api/feed/refresh', { method: 'POST' })}>
          ↻ Refresh
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Input
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
          placeholder="Search captions, brands, hashtags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[240px]"
        />
        <div className="flex bg-[var(--surface-2)] rounded-[var(--radius)] p-0.5">
          {(['recent', 'likes', 'engagement', 'shuffle'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className={cn('px-2.5 h-8 rounded text-[11px] font-semibold capitalize transition-colors',
                sort === s ? 'bg-[var(--surface)] shadow-sm' : 'text-[var(--ink-muted)]',
              )}>{s === 'recent' ? 'Recent' : s === 'likes' ? 'Top' : s === 'engagement' ? 'Trending' : 'Shuffle'}</button>
          ))}
        </div>
      </div>

      {/* Category chips */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              'h-8 px-3 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors',
              cat === c ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]',
            )}
          >{c}</button>
        ))}
      </div>

      {/* Grid */}
      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="aspect-square" />)}
        </div>
      )}
      {data && data.posts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.posts.map(p => (
            <MediaCard
              key={p.id}
              image={p.imageUrl}
              aspect="square"
              href={p.postUrl}
              overlayTop={
                <a href={`/brands/${encodeURIComponent(p.brand.handle)}`} onClick={(e) => e.stopPropagation()} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/50 text-white backdrop-blur-sm">
                  @{p.brand.handle}
                </a>
              }
              overlayBottom={
                <div className="flex items-center justify-between">
                  <span className="text-[10px]">{rel(p.postedAt)}</span>
                  {p.likes > 0 && <span className="text-[10px] font-semibold">♥ {formatNum(p.likes)}</span>}
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
