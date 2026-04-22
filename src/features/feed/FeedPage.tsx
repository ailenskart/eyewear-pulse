'use client';

import * as React from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogBody } from '@/components/ui/Dialog';
import { cn } from '@/components/ui/cn';

interface CarouselSlide { url: string; type: string }

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
  videoUrl?: string | null;
  carouselSlides?: CarouselSlide[];
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
  const [openPost, setOpenPost] = React.useState<Post | null>(null);
  const [slideIdx, setSlideIdx] = React.useState(0);
  React.useEffect(() => { setSlideIdx(0); }, [openPost]);

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
              onClick={() => setOpenPost(p)}
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

      {/* Post lightbox — serves image/video from our Vercel Blob, not IG */}
      <Dialog open={!!openPost} onClose={() => setOpenPost(null)} maxWidth="max-w-5xl">
        {openPost && (() => {
          const slides = openPost.carouselSlides && openPost.carouselSlides.length > 0
            ? openPost.carouselSlides
            : [{ url: openPost.imageUrl, type: openPost.isVideo ? 'Video' : 'Image' }];
          const slide = slides[Math.min(slideIdx, slides.length - 1)];
          const isVid = slide.type?.toLowerCase().includes('video');
          return (
            <div className="flex flex-col md:flex-row max-h-[90vh]">
              {/* Media */}
              <div className="relative bg-black flex-1 min-h-[40vh] md:min-h-0 md:max-w-[60%] flex items-center justify-center">
                {isVid && openPost.videoUrl ? (
                  <video
                    key={openPost.videoUrl}
                    src={openPost.videoUrl}
                    controls
                    autoPlay
                    playsInline
                    className="max-w-full max-h-[90vh] object-contain"
                  />
                ) : (
                  <img
                    src={slide.url}
                    alt=""
                    className="max-w-full max-h-[90vh] object-contain"
                  />
                )}
                {slides.length > 1 && (
                  <>
                    <button
                      onClick={() => setSlideIdx(i => Math.max(0, i - 1))}
                      disabled={slideIdx === 0}
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-xl disabled:opacity-30"
                      aria-label="Previous slide"
                    >‹</button>
                    <button
                      onClick={() => setSlideIdx(i => Math.min(slides.length - 1, i + 1))}
                      disabled={slideIdx >= slides.length - 1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-xl disabled:opacity-30"
                      aria-label="Next slide"
                    >›</button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-medium">
                      {slideIdx + 1} / {slides.length}
                    </div>
                  </>
                )}
              </div>
              {/* Metadata */}
              <DialogBody className="md:w-[40%] md:max-w-[480px] p-5">
                <div className="flex items-center justify-between mb-3">
                  <a
                    href={`/brands/${encodeURIComponent(openPost.brand.handle)}`}
                    className="text-[14px] font-semibold hover:text-[var(--accent)]"
                  >
                    @{openPost.brand.handle}
                  </a>
                  <span className="text-[11px] text-[var(--ink-muted)]">{rel(openPost.postedAt)}</span>
                </div>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap mb-4">{openPost.caption || <span className="text-[var(--ink-muted)] italic">No caption</span>}</p>
                <div className="flex items-center gap-4 text-[12px] text-[var(--ink-muted)] mb-5">
                  {openPost.likes > 0 && <span>♥ {formatNum(openPost.likes)}</span>}
                  {openPost.comments > 0 && <span>💬 {formatNum(openPost.comments)}</span>}
                </div>
                <a
                  href={openPost.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--accent)] underline underline-offset-2"
                >
                  View on Instagram ↗
                </a>
              </DialogBody>
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
}
