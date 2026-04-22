'use client';

import * as React from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
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

/** Build the full slide list for a post: main image first, then any carousel children. */
function buildSlides(p: Post): CarouselSlide[] {
  const tail = p.carouselSlides || [];
  // If the first carousel slide already equals the main image, don't double it.
  if (tail.length > 0 && tail[0].url === p.imageUrl) return tail;
  return [{ url: p.imageUrl, type: p.isVideo ? 'Video' : 'Image' }, ...tail];
}

/* ═══ Feed card — inline video autoplay + left/right tap-zone carousel ═══
   Re-implementation of the behaviour from the pre-Phase-2 monolith:
     • Click the video poster → switches to a looping muted <video>.
     • Click a carousel tile on left 30% → previous slide.
     • Click on right 30% → next slide.
     • Click the middle → opens the detail modal.
     • Slide dots + counter + Video badge overlay.
     • If the blob video 404s, falls back through /api/fix-media which
       re-downloads from IG and rehosts. */
function FeedCard({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const slides = React.useMemo(() => buildSlides(post), [post]);
  const hasSlides = slides.length > 1;

  const [slideIdx, setSlideIdx] = React.useState(0);
  const [imgError, setImgError] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [videoSrc, setVideoSrc] = React.useState<string | null>(post.videoUrl || null);
  const [videoFailed, setVideoFailed] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Fallback: server-side fetch from IG + upload to Blob when the existing
  // video URL fails (expired IG CDN signature).
  async function retryVideo() {
    if (!post.videoUrl) return;
    try {
      const res = await fetch('/api/fix-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: post.videoUrl, postId: post.id, type: 'video' }),
      });
      const data = await res.json();
      if (data.blobUrl) {
        setVideoSrc(data.blobUrl);
        setVideoFailed(false);
        setPlaying(true);
      }
    } catch { /* still broken */ }
  }

  function handleTileClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!hasSlides) { onOpen(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) setSlideIdx(i => Math.max(0, i - 1));
    else if (x > rect.width * 0.7) setSlideIdx(i => Math.min(slides.length - 1, i + 1));
    else onOpen();
  }

  return (
    <div className="group bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden hover:border-[var(--accent)] hover:shadow-[var(--shadow)] transition-all">
      <div className="relative aspect-square bg-[var(--surface-2)] overflow-hidden">
        {post.isVideo && post.videoUrl ? (
          !playing ? (
            <div className="relative w-full h-full cursor-pointer" onClick={() => setPlaying(true)}>
              {!imgError ? (
                <img src={post.imageUrl} alt="" loading="lazy" onError={() => setImgError(true)}
                     className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl text-[var(--ink-soft)]">👓</div>
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#111"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
            </div>
          ) : videoFailed ? (
            <div className="relative w-full h-full cursor-pointer" onClick={retryVideo}>
              <img src={post.imageUrl} alt="" className="w-full h-full object-cover opacity-60" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#111"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                </div>
                <span className="text-white text-[10px] font-medium bg-black/60 px-2 py-0.5 rounded">Tap to retry</span>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={videoSrc || post.videoUrl}
              autoPlay playsInline loop muted
              className="w-full h-full object-cover"
              onError={() => { setVideoFailed(true); setPlaying(false); }}
              onClick={(e) => {
                e.stopPropagation();
                if (videoRef.current?.paused) videoRef.current.play();
                else videoRef.current?.pause();
              }}
            />
          )
        ) : (
          <div className="relative w-full h-full cursor-pointer" onClick={handleTileClick}>
            {!imgError ? (
              <img src={slides[slideIdx].url} alt="" loading="lazy" onError={() => setImgError(true)}
                   className="w-full h-full object-cover transition-opacity duration-200 group-hover:scale-[1.02] transition-transform" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl text-[var(--ink-soft)]">👓</div>
            )}
          </div>
        )}

        {/* Dots overlay for carousels */}
        {hasSlides && !post.isVideo && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
            {slides.map((_, i) => (
              <div key={i} className={cn(
                'h-[3px] rounded-full transition-all duration-200',
                i === slideIdx ? 'bg-white w-4' : 'bg-white/40 w-1.5',
              )} />
            ))}
          </div>
        )}

        {/* Top-right: brand handle */}
        <a href={`/brands/${encodeURIComponent(post.brand.handle)}`}
           onClick={(e) => e.stopPropagation()}
           className="absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/50 text-white backdrop-blur-sm">
          @{post.brand.handle}
        </a>

        {/* Top-right: video or carousel badge */}
        {post.isVideo && !playing && (
          <div className="absolute top-2 right-2 bg-black/55 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            Video
          </div>
        )}
        {hasSlides && !post.isVideo && (
          <div className="absolute top-2 right-2 bg-black/55 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            {slideIdx + 1}/{slides.length}
          </div>
        )}

        {/* Bottom gradient + time/likes */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-1.5 text-white text-[11px] flex items-center justify-between pointer-events-none">
          <span className="text-[10px]">{rel(post.postedAt)}</span>
          {post.likes > 0 && <span className="text-[10px] font-semibold">♥ {formatNum(post.likes)}</span>}
        </div>
      </div>
    </div>
  );
}

/* ═══ Detail lightbox — arrow-key + tap-zone carousel, blob video ═══ */
function PostLightbox({ post, onClose }: { post: Post; onClose: () => void }) {
  const slides = React.useMemo(() => buildSlides(post), [post]);
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(slides.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length]);

  const curr = slides[Math.min(idx, slides.length - 1)];
  const showVideo = post.isVideo && post.videoUrl && idx === 0;

  function handleMediaClick(e: React.MouseEvent<HTMLDivElement>) {
    if (slides.length <= 1 || showVideo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) setIdx(i => Math.max(0, i - 1));
    else if (x > rect.width * 0.7) setIdx(i => Math.min(slides.length - 1, i + 1));
  }

  return (
    <div className="flex flex-col md:flex-row max-h-[90vh]">
      {/* Media */}
      <div className="relative bg-black flex-1 min-h-[40vh] md:min-h-0 md:max-w-[60%] flex items-center justify-center">
        <div className="w-full h-full flex items-center justify-center cursor-pointer" onClick={handleMediaClick}>
          {showVideo ? (
            <video
              key={post.videoUrl!}
              src={post.videoUrl!}
              controls autoPlay playsInline
              poster={post.imageUrl}
              className="max-w-full max-h-[90vh] object-contain"
            />
          ) : (
            <img src={curr.url} alt="" className="max-w-full max-h-[90vh] object-contain" />
          )}
        </div>
        {slides.length > 1 && (
          <>
            <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                    aria-label="Previous slide"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-xl disabled:opacity-30">‹</button>
            <button onClick={() => setIdx(i => Math.min(slides.length - 1, i + 1))} disabled={idx >= slides.length - 1}
                    aria-label="Next slide"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-xl disabled:opacity-30">›</button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-medium">
              {idx + 1} / {slides.length}
            </div>
          </>
        )}
      </div>
      {/* Metadata */}
      <div className="md:w-[40%] md:max-w-[480px] p-5 flex flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <a href={`/brands/${encodeURIComponent(post.brand.handle)}`}
             className="text-[14px] font-semibold hover:text-[var(--accent)]">@{post.brand.handle}</a>
          <button onClick={onClose} aria-label="Close"
                  className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-[20px] leading-none w-7 h-7 flex items-center justify-center rounded">×</button>
        </div>
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
          {post.caption || <span className="text-[var(--ink-muted)] italic">No caption</span>}
        </p>
        <div className="flex items-center gap-4 text-[12px] text-[var(--ink-muted)]">
          {post.likes > 0 && <span>♥ {formatNum(post.likes)}</span>}
          {post.comments > 0 && <span>💬 {formatNum(post.comments)}</span>}
          <span>{rel(post.postedAt)}</span>
        </div>
        <a href={post.postUrl} target="_blank" rel="noopener noreferrer"
           className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--accent)] underline underline-offset-2">
          View on Instagram ↗
        </a>
      </div>
    </div>
  );
}

export function FeedPage() {
  const [data, setData] = React.useState<FeedData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [cat, setCat] = React.useState('All');
  const [sort, setSort] = React.useState<'recent' | 'likes' | 'engagement' | 'shuffle'>('recent');
  const [openPost, setOpenPost] = React.useState<Post | null>(null);

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
          {data.posts.map(p => <FeedCard key={p.id} post={p} onOpen={() => setOpenPost(p)} />)}
        </div>
      )}

      <Dialog open={!!openPost} onClose={() => setOpenPost(null)} maxWidth="max-w-5xl">
        {openPost && <PostLightbox post={openPost} onClose={() => setOpenPost(null)} />}
      </Dialog>
    </div>
  );
}
