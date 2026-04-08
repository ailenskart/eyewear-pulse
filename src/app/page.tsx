'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/* ---------- types ---------- */
interface CarouselSlide { url: string; type: string; }
interface Post {
  id: string;
  brand: { name: string; handle: string; category: string; region: string; priceRange: string };
  imageUrl: string;
  videoUrl: string | null;
  carouselSlides: CarouselSlide[];
  caption: string;
  likes: number;
  comments: number;
  engagement: number;
  hashtags: string[];
  postedAt: string;
  postUrl: string;
  type: string;
  isVideo: boolean;
}

interface FeedStats {
  totalPosts: number;
  totalBrands: number;
  avgEngagement: number;
  topHashtags: Array<{ name: string; count: number }>;
  contentMix: Array<{ name: string; count: number }>;
  byCategory: Array<{ name: string; count: number }>;
  byRegion: Array<{ name: string; count: number }>;
}

interface FeedResponse {
  posts: Post[];
  total: number;
  page: number;
  totalPages: number;
  stats: FeedStats;
}

/* ---------- constants ---------- */
const CATEGORIES = ['All', 'Luxury', 'D2C', 'Sports', 'Fast Fashion', 'Independent', 'Heritage', 'Streetwear', 'Sustainable', 'Tech', 'Kids', 'Celebrity'];
const REGIONS = ['All', 'North America', 'Europe', 'Asia Pacific', 'South Asia', 'Middle East', 'Latin America', 'Africa', 'Southeast Asia', 'East Asia', 'Oceania'];
// Removed STYLES - no longer using generated style data
const SORT_OPTIONS = [
  { key: 'recent', label: 'Recent' },
  { key: 'likes', label: 'Most Liked' },
  { key: 'engagement', label: 'Top Engagement' },
  { key: 'comments', label: 'Most Discussed' },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

/* ---------- components ---------- */

function PostCard({ post, onClick }: { post: Post; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="card group cursor-pointer overflow-hidden animate-fade-in"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div className="aspect-square overflow-hidden bg-[var(--bg-secondary)] relative">
        {imgError ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/></svg>
            <span className="text-[var(--text-muted)] text-xs font-medium">{post.brand.name}</span>
          </div>
        ) : (
          <img src={post.imageUrl} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" onError={() => setImgError(true)} />
        )}

        {/* Hover overlay */}
        <div className={`absolute inset-0 bg-black/50 flex items-center justify-center gap-5 transition-opacity duration-200 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-center"><div className="text-white text-base font-bold">{formatNumber(post.likes)}</div><div className="text-white/50 text-[10px]">likes</div></div>
          <div className="text-center"><div className="text-white text-base font-bold">{formatNumber(post.comments)}</div><div className="text-white/50 text-[10px]">comments</div></div>
        </div>

        {/* Video play button */}
        {post.isVideo && post.videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-11 h-11 rounded-full bg-white/90 shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <span className="text-[var(--accent)] text-lg ml-0.5">&#9654;</span>
            </div>
          </div>
        )}

        {/* Carousel indicator */}
        {post.carouselSlides.length > 0 && !post.isVideo && (
          <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
            1/{post.carouselSlides.length}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-semibold text-[var(--text-primary)]">{post.brand.name}</span>
          <span className="text-[10px] text-[var(--text-muted)]">{timeAgo(post.postedAt)}</span>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{post.caption}</p>
      </div>
    </div>
  );
}

function PostModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const [imgError, setImgError] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);

  const slides = post.carouselSlides.length > 0
    ? post.carouselSlides.map(s => s.url)
    : [post.imageUrl];
  const currentSlide = slides[slideIdx] || post.imageUrl;
  const hasMultipleSlides = slides.length > 1;

  // Video posts get a clean centered video dialog
  if (post.isVideo && post.videoUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
        <div className="relative w-full sm:max-w-lg sm:mx-4" onClick={e => e.stopPropagation()}>
          {/* Close button */}
          <button onClick={onClose} className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-colors">✕</button>

          {/* Video player */}
          <div className="rounded-t-2xl sm:rounded-2xl overflow-hidden bg-black shadow-2xl max-h-[95vh] sm:max-h-[85vh] flex flex-col">
            <video
              src={post.videoUrl}
              controls
              autoPlay
              playsInline
              className="w-full flex-1 object-contain max-h-[60vh] sm:max-h-[65vh]"
              poster={post.imageUrl}
            />

            {/* Info bar below video */}
            <div className="bg-[var(--bg-card)] p-3 sm:p-4 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(post.brand.name)}&size=32&background=6366f1&color=fff&bold=true`}
                  alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex-shrink-0"
                />
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{post.brand.name}</span>
                  <span className="text-xs text-[var(--text-muted)] ml-1.5">@{post.brand.handle}</span>
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{post.caption}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-xs text-[var(--accent-light)] font-semibold">{formatNumber(post.likes)} likes</span>
                <span className="text-xs text-[var(--text-muted)]">{formatNumber(post.comments)} comments</span>
                <span className="text-xs text-emerald-400">{post.engagement}%</span>
                <div className="flex-1" />
                <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1 rounded-full bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white font-medium hover:opacity-90 transition-opacity">
                  View on IG
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Image/carousel posts get the side-by-side modal
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-2xl border border-[var(--border)] sm:max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row sm:mx-4" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white/80 hover:text-white transition-colors">✕</button>

        {/* Image side */}
        <div className="md:w-[55%] bg-black flex items-center relative">
          {imgError ? (
            <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95]">
              <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-3xl">👓</div>
              <span className="text-white/60 text-sm font-medium">{post.brand.name}</span>
            </div>
          ) : (
            <img src={currentSlide} alt={post.caption} className="w-full h-full object-cover max-h-[50vh] md:max-h-[90vh]" onError={() => setImgError(true)} />
          )}
          {/* Carousel navigation */}
          {hasMultipleSlides && (
            <>
              {slideIdx > 0 && (
                <button onClick={(e) => { e.stopPropagation(); setSlideIdx(i => i - 1); }} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">&#8249;</button>
              )}
              {slideIdx < slides.length - 1 && (
                <button onClick={(e) => { e.stopPropagation(); setSlideIdx(i => i + 1); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">&#8250;</button>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                {slides.map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === slideIdx ? 'bg-white w-3' : 'bg-white/40'}`} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Info side */}
        <div className="md:w-[45%] flex flex-col overflow-y-auto">
          {/* Brand header */}
          <div className="flex items-center gap-3 p-5 border-b border-[var(--border)]">
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(post.brand.name)}&size=44&background=6366f1&color=fff&bold=true`}
              alt="" className="w-11 h-11 rounded-full"
            />
            <div>
              <div className="font-semibold text-sm">{post.brand.name}</div>
              <div className="text-xs text-[var(--text-muted)]">@{post.brand.handle} · {post.brand.category} · {post.brand.region}</div>
            </div>
          </div>

          {/* Engagement */}
          <div className="grid grid-cols-3 gap-0 border-b border-[var(--border)]">
            <div className="text-center py-4 border-r border-[var(--border)]">
              <div className="text-xl font-bold text-[var(--accent-light)]">{formatNumber(post.likes)}</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Likes</div>
            </div>
            <div className="text-center py-4 border-r border-[var(--border)]">
              <div className="text-xl font-bold text-[var(--accent-light)]">{formatNumber(post.comments)}</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Comments</div>
            </div>
            <div className="text-center py-4">
              <div className="text-xl font-bold text-emerald-400">{post.engagement}%</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Engagement</div>
            </div>
          </div>

          {/* Caption */}
          <div className="p-5 border-b border-[var(--border)]">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{post.caption}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {post.hashtags.map(tag => (
                <span key={tag} className="text-xs text-[var(--accent-light)] hover:underline cursor-pointer">{tag}</span>
              ))}
            </div>
          </div>

          {/* Post details */}
          <div className="p-5 border-b border-[var(--border)]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Content Type</div>
                <div className="text-sm font-medium">{post.type}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Price Range</div>
                <div className="text-sm font-medium">{post.brand.priceRange}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Region</div>
                <div className="text-sm font-medium">{post.brand.region}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Posted</div>
                <div className="text-sm font-medium">{timeAgo(post.postedAt)}</div>
              </div>
            </div>
          </div>

          {/* IG links */}
          <div className="p-5 space-y-2">
            <a
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-2.5 rounded-xl bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white text-sm font-semibold text-center hover:opacity-90 transition-opacity"
            >
              View Post on Instagram
            </a>
            <a
              href={`https://www.instagram.com/${post.brand.handle}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-sm font-semibold text-center hover:bg-[var(--bg-card)] transition-colors"
            >
              View @{post.brand.handle} Profile
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${active
      ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/25'
      : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)]'
    }`}>{label}</button>
  );
}

function TrendBadge({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = ((count / total) * 100).toFixed(0);
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: color }}>
        {pct}%
      </div>
      <div>
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-[10px] text-[var(--text-muted)]">{count} posts</div>
      </div>
    </div>
  );
}

/* ---------- intel view ---------- */
interface IntelData {
  summary: { totalPosts: number; totalBrands: number; avgEngagement: number; totalLikes: number; totalComments: number; avgLikesPerPost: number };
  topPosts: Array<{ brand: string; handle: string; caption: string; likes: number; comments: number; imageUrl: string; postUrl: string; type: string }>;
  brandLeaderboard: Array<{ name: string; handle: string; category: string; posts: number; likes: number; comments: number; avgLikes: number; topPostLikes: number; videos: number; carousels: number; images: number }>;
  contentPerformance: Array<{ type: string; count: number; avgLikes: number; avgComments: number; pct: number }>;
  categories: Array<{ name: string; posts: number; totalLikes: number; brands: number; topBrand: string }>;
  regions: Array<{ name: string; posts: number; totalLikes: number; brands: number }>;
  topHashtags: Array<{ name: string; count: number }>;
  influencers: Array<{ handle: string; mentions: number; brands: string[]; brandCount: number }>;
  trendAlerts: Array<{ brand: string; handle: string; likes: number; comments: number; caption: string; imageUrl: string; postUrl: string; multiplier: number; type: string; postedAt: string }>;
  bestDays: Array<{ day: string; posts: number; avgLikes: number }>;
  bestHours: Array<{ hour: string; posts: number; avgLikes: number }>;
}

function IntelView({ intel, onLoad }: { intel: Record<string, unknown> | null; onLoad: () => void }) {
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const [compareInput, setCompareInput] = useState('');
  const [compareData, setCompareData] = useState<Array<Record<string, unknown>> | null>(null);

  useEffect(() => { onLoad(); }, [onLoad]);

  if (!intel) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const d = intel as unknown as IntelData;
  const C = ['#6366f1','#8b5cf6','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899','#a78bfa','#4f46e5','#14b8a6'];

  return (
    <div className="space-y-8">
      {/* Hero stats */}
      <div className="bg-gradient-to-r from-[var(--accent)]/10 via-purple-900/10 to-pink-900/10 rounded-2xl border border-[var(--accent)]/30 p-6 md:p-8">
        <h2 className="text-xl md:text-2xl font-bold mb-1">Global Eyewear Intelligence</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">Real-time insights from {formatNumber(d.summary.totalPosts)} Instagram posts across {d.summary.totalBrands} eyewear brands</p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {[
            { label: 'Posts', value: formatNumber(d.summary.totalPosts), color: C[0] },
            { label: 'Brands', value: String(d.summary.totalBrands), color: C[1] },
            { label: 'Total Likes', value: formatNumber(d.summary.totalLikes), color: C[2] },
            { label: 'Total Comments', value: formatNumber(d.summary.totalComments), color: C[3] },
            { label: 'Avg Likes/Post', value: formatNumber(d.summary.avgLikesPerPost), color: C[4] },
            { label: 'Avg Engagement', value: `${d.summary.avgEngagement}%`, color: C[5] },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-xl md:text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trend Alerts */}
      {d.trendAlerts.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">Trend Alerts <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">VIRAL</span></h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {d.trendAlerts.slice(0, 6).map((t, i) => (
              <a key={i} href={t.postUrl} target="_blank" rel="noopener noreferrer" className="flex gap-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-[#1e1b4b] to-[#4c1d95] flex-shrink-0">
                  {!imgErrors.has(t.postUrl) ? (
                    <img src={t.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setImgErrors(prev => new Set(prev).add(t.postUrl))} />
                  ) : <div className="w-full h-full flex items-center justify-center text-lg">👓</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">{t.brand}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">{t.multiplier}x avg</span>
                  </div>
                  <div className="text-xs text-[var(--accent-light)] font-semibold mt-0.5">{formatNumber(t.likes)} likes · {formatNumber(t.comments)} comments</div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{t.caption}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Top Posts */}
      <div>
        <h3 className="text-lg font-bold mb-3">Top Performing Posts</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {d.topPosts.map((p, i) => (
            <a key={i} href={p.postUrl} target="_blank" rel="noopener noreferrer" className="group rounded-xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all">
              <div className="aspect-square overflow-hidden bg-gradient-to-br from-[#1e1b4b] to-[#4c1d95]">
                {!imgErrors.has(p.postUrl) ? (
                  <img src={p.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" onError={() => setImgErrors(prev => new Set(prev).add(p.postUrl))} />
                ) : <div className="w-full h-full flex items-center justify-center text-3xl">👓</div>}
              </div>
              <div className="p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold truncate">{p.brand}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">{p.type}</span>
                </div>
                <div className="text-xs text-[var(--accent-light)] font-bold mt-1">{formatNumber(p.likes)} likes</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Brand Leaderboard */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="p-5 border-b border-[var(--border)]"><h3 className="text-sm font-semibold">Brand Leaderboard</h3></div>
        <div className="divide-y divide-[var(--border)]">
          {d.brandLeaderboard.map((b, i) => (
            <div key={b.handle} className="flex items-center gap-3 px-5 py-3">
              <span className="text-lg font-bold w-8 text-center" style={{ color: C[i % C.length] }}>#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{b.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">{b.category}</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">@{b.handle} · {b.posts} posts · avg {formatNumber(b.avgLikes)}/post · V:{b.videos} C:{b.carousels} I:{b.images}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-[var(--accent-light)]">{formatNumber(b.likes)}</div>
                <div className="text-[10px] text-[var(--text-muted)]">total likes</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Influencer Discovery + Content Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Influencers */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-semibold mb-1">Influencer Discovery</h3>
          <p className="text-[10px] text-[var(--text-muted)] mb-4">Accounts mentioned by 2+ different brands</p>
          <div className="space-y-2">
            {d.influencers.slice(0, 12).map((inf, i) => (
              <div key={inf.handle} className="flex items-center gap-2">
                <span className="text-xs font-bold w-5" style={{ color: C[i % C.length] }}>{i + 1}</span>
                <a href={`https://instagram.com/${inf.handle}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--accent-light)] hover:underline">@{inf.handle}</a>
                <span className="text-[10px] text-[var(--text-muted)]">{inf.mentions} mentions by {inf.brandCount} brands</span>
                <div className="flex-1" />
                <div className="flex gap-1">
                  {inf.brands.slice(0, 3).map(b => (
                    <span key={b} className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">{b}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Best Times to Post */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-semibold mb-4">Best Times to Post</h3>
          <div className="mb-4">
            <p className="text-[10px] text-[var(--text-muted)] mb-2 uppercase tracking-wider">Best Days (by avg likes)</p>
            <div className="grid grid-cols-7 gap-1">
              {d.bestDays.map((day, i) => (
                <div key={day.day} className="text-center p-2 rounded-lg" style={{ background: i === 0 ? 'rgba(99,102,241,0.15)' : 'transparent' }}>
                  <div className="text-[10px] text-[var(--text-muted)]">{day.day.substring(0, 3)}</div>
                  <div className="text-xs font-bold" style={{ color: i < 3 ? C[2] : 'var(--text-secondary)' }}>{formatNumber(day.avgLikes)}</div>
                  <div className="text-[9px] text-[var(--text-muted)]">{day.posts}p</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-muted)] mb-2 uppercase tracking-wider">Best Hours UTC (by avg likes)</p>
            <div className="grid grid-cols-4 gap-2">
              {d.bestHours.slice(0, 8).map((h, i) => (
                <div key={h.hour} className="text-center p-2 rounded-lg bg-[var(--bg-secondary)]">
                  <div className="text-xs font-bold" style={{ color: i < 3 ? C[2] : 'var(--text-secondary)' }}>{h.hour}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">avg {formatNumber(h.avgLikes)} likes</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content Performance + Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-semibold mb-4">Content Type Performance</h3>
          {d.contentPerformance.map((c, i) => (
            <div key={c.type} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">{c.type} <span className="text-[var(--text-muted)] font-normal">({c.count} posts)</span></span>
                <span className="text-xs font-semibold" style={{ color: C[i] }}>avg {formatNumber(c.avgLikes)} likes</span>
              </div>
              <div className="h-3 rounded-full bg-[var(--bg-secondary)]"><div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: C[i] }} /></div>
            </div>
          ))}
        </div>
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-semibold mb-4">Posts by Category</h3>
          {d.categories.map((c, i) => (
            <div key={c.name} className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ background: C[i % C.length] }} />
              <span className="text-xs font-semibold flex-1">{c.name}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{c.posts} posts · {c.brands} brands</span>
            </div>
          ))}
        </div>
      </div>

      {/* Brand Compare Tool */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
        <h3 className="text-sm font-semibold mb-1">Brand Comparison</h3>
        <p className="text-[10px] text-[var(--text-muted)] mb-3">Compare any two brands side by side</p>
        <div className="flex gap-2">
          <input
            type="text" value={compareInput} onChange={e => setCompareInput(e.target.value)}
            placeholder="e.g. warbyparker,zennioptical"
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button onClick={async () => {
            if (!compareInput) return;
            const res = await fetch(`/api/intel?compare=${encodeURIComponent(compareInput)}`);
            const data = await res.json();
            setCompareData(data.brandComparison);
          }} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90">Compare</button>
        </div>
        {compareData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {compareData.map((b: Record<string, unknown>, i: number) => (
              <div key={i} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                {!(b.found) ? <p className="text-xs text-[var(--text-muted)]">@{String(b.handle)} not found</p> : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-bold">{String(b.name)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)]">{String(b.category)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div><div className="text-lg font-bold" style={{ color: C[i] }}>{Number(b.posts)}</div><div className="text-[10px] text-[var(--text-muted)]">Posts</div></div>
                      <div><div className="text-lg font-bold" style={{ color: C[i] }}>{formatNumber(Number(b.totalLikes))}</div><div className="text-[10px] text-[var(--text-muted)]">Likes</div></div>
                      <div><div className="text-lg font-bold" style={{ color: C[i] }}>{formatNumber(Number(b.avgLikes))}</div><div className="text-[10px] text-[var(--text-muted)]">Avg/Post</div></div>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Mix: {(b.contentMix as Record<string, number>).videos}V {(b.contentMix as Record<string, number>).carousels}C {(b.contentMix as Record<string, number>).images}I · {String(b.region)}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Regions + Hashtags */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-semibold mb-4">Global Coverage</h3>
          <div className="grid grid-cols-2 gap-2">
            {d.regions.map((r, i) => (
              <div key={r.name} className="p-2.5 rounded-lg bg-[var(--bg-secondary)] flex items-center gap-2">
                <div className="text-lg font-bold" style={{ color: C[i % C.length] }}>{r.posts}</div>
                <div><div className="text-xs font-semibold">{r.name}</div><div className="text-[9px] text-[var(--text-muted)]">{r.brands} brands</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-semibold mb-4">Trending Hashtags</h3>
          <div className="flex flex-wrap gap-2">
            {d.topHashtags.map((h, i) => (
              <span key={h.name} className="px-2.5 py-1 rounded-full text-xs font-medium border border-[var(--border)]" style={{ color: C[i % C.length] }}>
                #{h.name} <span className="text-[var(--text-muted)]">({h.count})</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- products view ---------- */
interface ProductData {
  products: Array<{ brand: string; name: string; price: string; comparePrice?: string; image: string; type: string; url: string; isNew?: boolean; isDelisted?: boolean }>;
  total: number; page: number; totalPages: number;
  brands: string[];
  priceRanges: Record<string, number>;
  avgByBrand: Array<{ brand: string; products: number; avgPrice: number; minPrice: number; maxPrice: number }>;
  stats?: { totalActive: number; newThisWeek: number; delisted: number; totalBrands: number };
}

function ProductsView() {
  const [data, setData] = useState<ProductData | null>(null);
  const [brand, setBrand] = useState('All');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('price_asc');
  const [show, setShow] = useState('active');
  const [page, setPage] = useState(1);
  const [imgErr, setImgErr] = useState<Set<number>>(new Set());

  const fetchProducts = useCallback(async () => {
    const params = new URLSearchParams({ brand, search, sortBy, show, page: String(page), limit: '40' });
    const res = await fetch(`/api/products?${params}`);
    setData(await res.json());
  }, [brand, search, sortBy, show, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const C = ['#6366f1','#8b5cf6','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899','#a78bfa','#4f46e5','#14b8a6'];

  if (!data) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Stats + status tabs */}
      <div className="bg-gradient-to-r from-emerald-900/20 via-[var(--accent)]/10 to-amber-900/20 rounded-2xl border border-emerald-500/20 p-6">
        <h2 className="text-xl font-bold mb-1">Product & Pricing Intelligence</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {data.stats ? `${formatNumber(data.stats.totalActive)} active products from ${data.stats.totalBrands} brands` : `Real pricing from ${data.brands.length} brands`}
          {data.stats?.newThisWeek ? ` · ${data.stats.newThisWeek} new this week` : ''}
          {data.stats?.delisted ? ` · ${data.stats.delisted} delisted` : ''}
        </p>
        <div className="flex gap-2 mb-5">
          {[
            { key: 'active', label: 'All Active', count: data.stats?.totalActive },
            { key: 'new', label: 'New This Week', count: data.stats?.newThisWeek },
            { key: 'delisted', label: 'Delisted', count: data.stats?.delisted },
          ].map(t => (
            <button key={t.key} onClick={() => { setShow(t.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${show === t.key
                ? 'bg-emerald-500 text-white'
                : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
              {t.label} {t.count ? `(${t.count})` : ''}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(data.priceRanges).map(([range, count], i) => {
            const labels: Record<string, string> = { under25: 'Under $25', '25to50': '$25-50', '50to100': '$50-100', '100to200': '$100-200', over200: '$200+' };
            return (
              <div key={range} className="text-center p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                <div className="text-xl font-bold" style={{ color: C[i] }}>{count}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{labels[range] || range}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Avg price by brand */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
        <h3 className="text-sm font-semibold mb-4">Average Price by Brand</h3>
        <div className="space-y-2">
          {data.avgByBrand.map((b, i) => {
            const maxAvg = Math.max(...data.avgByBrand.map(x => x.avgPrice));
            return (
              <div key={b.brand} className="flex items-center gap-3">
                <span className="text-xs font-semibold w-28 truncate">{b.brand}</span>
                <div className="flex-1 h-3 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(b.avgPrice / maxAvg) * 100}%`, background: C[i % C.length] }} />
                </div>
                <span className="text-xs font-bold w-16 text-right" style={{ color: C[i % C.length] }}>${b.avgPrice}</span>
                <span className="text-[10px] text-[var(--text-muted)] w-20">${b.minPrice}-${b.maxPrice}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={brand} onChange={e => { setBrand(e.target.value); setPage(1); }}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]">
          <option value="All">All Brands</option>
          {data.brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]">
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="newest">Newest First</option>
          <option value="brand">Brand A-Z</option>
          <option value="name">Name A-Z</option>
        </select>
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search products..."
          className="flex-1 min-w-[200px] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]" />
        <span className="text-xs text-[var(--text-muted)]">{data.total} products</span>
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {data.products.map((p, i) => (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
            className="group rounded-xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all animate-fade-in">
            <div className="aspect-square overflow-hidden bg-white">
              {imgErr.has(i) ? (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1e1b4b] to-[#4c1d95]"><span className="text-3xl">👓</span></div>
              ) : (
                <img src={p.image} alt={p.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform p-2"
                  loading="lazy" onError={() => setImgErr(prev => new Set(prev).add(i))} />
              )}
            </div>
            {/* NEW / SALE badges */}
            {p.isNew && <div className="absolute top-2 left-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">NEW</div>}
            {p.isDelisted && <div className="absolute top-2 left-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">GONE</div>}
            {p.comparePrice && !p.isDelisted && !p.isNew && <div className="absolute top-2 left-2 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">SALE</div>}
            <div className="p-3">
              <div className="text-[10px] text-[var(--accent-light)] font-semibold uppercase">{p.brand}</div>
              <h4 className="text-xs font-medium mt-0.5 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{p.name}</h4>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-emerald-400">{p.price}</span>
                  {p.comparePrice && <span className="text-[10px] text-[var(--text-muted)] line-through">{p.comparePrice}</span>}
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">{p.type || 'Eyewear'}</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs disabled:opacity-30">Previous</button>
          <span className="text-xs text-[var(--text-muted)]">Page {data.page} of {data.totalPages}</span>
          <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}
            className="px-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}

/* ---------- main page ---------- */
export default function Dashboard() {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [region, setRegion] = useState('All');
  // style filter removed — using real scraped data now
  const [sortBy, setSortBy] = useState('recent');
  const [page, setPage] = useState(1);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<'feed' | 'trends' | 'ai' | 'products'>('feed');
  const [intel, setIntel] = useState<Record<string, unknown> | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        category, region, sortBy,
        search, page: String(page), limit: '40',
      });
      const res = await fetch(`/api/feed?${params}`);
      const json: FeedResponse = await res.json();
      setData(json);
    } catch (e) {
      console.error('Failed to fetch:', e);
    }
    setLoading(false);
  }, [category, region, sortBy, search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = (val: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 300);
  };

  const stats = data?.stats;
  const ACCENT_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#6d28d9', '#4f46e5', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">Loading eyewear feed...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b border-[var(--border)]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
            {/* Logo */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/><path d="M12 12h0"/><path d="M4 12H2"/><path d="M22 12h-2"/></svg>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">EyeWear Pulse</h1>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden sm:flex items-center gap-1 bg-[var(--bg-secondary)] rounded-lg p-0.5">
              {[
                { key: 'feed', label: 'Feed', icon: '📸' },
                { key: 'products', label: 'Products', icon: '🛍️' },
                { key: 'ai', label: 'Intelligence', icon: '📊' },
                { key: 'trends', label: 'Trends', icon: '📈' },
              ].map(tab => (
                <button key={tab.key} onClick={() => setView(tab.key as typeof view)}
                  className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                    view === tab.key
                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Search */}
            <div className="flex-1 max-w-sm">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-[var(--bg-secondary)] border-none rounded-lg pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 transition-all"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <div className="mobile-nav sm:hidden">
        {[
          { key: 'feed', label: 'Feed', icon: '📸' },
          { key: 'products', label: 'Products', icon: '🛍️' },
          { key: 'ai', label: 'Intel', icon: '📊' },
          { key: 'trends', label: 'Trends', icon: '📈' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setView(tab.key as typeof view)}
            className={view === tab.key ? 'active' : ''}>
            <span className="nav-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5">
        {view === 'feed' && (
          <>
            {/* Sort + filter bar */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
              {SORT_OPTIONS.map(s => (
                <button key={s.key} onClick={() => { setSortBy(s.key); setPage(1); }}
                  className={`pill whitespace-nowrap ${sortBy === s.key ? 'active' : ''}`}>{s.label}</button>
              ))}
              <button onClick={() => setShowFilters(!showFilters)}
                className={`pill whitespace-nowrap ${showFilters ? 'active' : ''}`}>
                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                Filters
              </button>
              <div className="flex-1" />
              <span className="text-[13px] text-[var(--text-muted)] whitespace-nowrap">{data?.total || 0} posts</span>
            </div>

            {/* Expandable filters */}
            {showFilters && (
              <div className="space-y-2 mb-5 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] animate-fade-in">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--text-muted)] font-medium w-16">Category</span>
                  {CATEGORIES.map(c => <FilterChip key={c} label={c} active={category === c} onClick={() => { setCategory(c); setPage(1); }} />)}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--text-muted)] font-medium w-16">Region</span>
                  {REGIONS.map(r => <FilterChip key={r} label={r} active={region === r} onClick={() => { setRegion(r); setPage(1); }} />)}
                </div>
              </div>
            )}

            {/* Photo grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {data?.posts.map((post, i) => (
                <div key={post.id} style={{ animationDelay: `${i * 20}ms` }}>
                  <PostCard post={post} onClick={() => setSelectedPost(post)} />
                </div>
              ))}
            </div>

            {/* Empty state */}
            {data?.posts.length === 0 && !loading && (
              <div className="text-center py-20">
                <p className="text-[var(--text-muted)] text-lg">No posts match your filters</p>
                <p className="text-[var(--text-muted)] text-sm mt-2">Try adjusting your search or filters</p>
              </div>
            )}

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm disabled:opacity-30 hover:bg-[var(--bg-card-hover)] transition-colors">
                  Previous
                </button>
                <span className="text-sm text-[var(--text-muted)]">
                  Page {data.page} of {data.totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}
                  className="px-5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm disabled:opacity-30 hover:bg-[var(--bg-card-hover)] transition-colors">
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {view === 'trends' && stats && (
          <div className="space-y-6">
            {/* Hero */}
            <div className="bg-gradient-to-r from-[var(--accent)]/10 to-purple-900/10 rounded-2xl border border-[var(--accent)]/30 p-6">
              <h2 className="text-lg font-bold mb-1">What are eyewear brands posting?</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Visual intelligence from {stats.totalPosts} posts across {stats.totalBrands} global eyewear brands. Learn what styles, materials, and content types drive the most engagement.
              </p>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl p-5 border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="text-3xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] bg-clip-text text-transparent">{formatNumber(stats.totalPosts)}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">Real Posts Scraped</div>
              </div>
              <div className="rounded-2xl p-5 border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="text-3xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] bg-clip-text text-transparent">{stats.totalBrands}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">Instagram Accounts</div>
              </div>
              <div className="rounded-2xl p-5 border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">{stats.avgEngagement}%</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">Avg Engagement</div>
              </div>
              <div className="rounded-2xl p-5 border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-amber-300 bg-clip-text text-transparent">{stats.topHashtags.length}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">Trending Hashtags</div>
              </div>
            </div>

            {/* Posts by Category */}
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
              <h3 className="text-sm font-semibold mb-4">Posts by Brand Category</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {stats.byCategory.map((s, i) => (
                  <TrendBadge key={s.name} label={s.name} count={s.count} total={stats.totalPosts} color={ACCENT_COLORS[i % ACCENT_COLORS.length]} />
                ))}
              </div>
            </div>

            {/* Category + Region side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
                <h3 className="text-sm font-semibold mb-4">Posts by Category</h3>
                <div className="space-y-3">
                  {stats.byCategory.map((m, i) => {
                    const pct = (m.count / stats.totalPosts * 100);
                    return (
                      <div key={m.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[var(--text-secondary)]">{m.name}</span>
                          <span className="text-xs font-semibold" style={{ color: ACCENT_COLORS[i % ACCENT_COLORS.length] }}>{pct.toFixed(0)}% ({m.count})</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--bg-secondary)]">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: ACCENT_COLORS[i % ACCENT_COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
                <h3 className="text-sm font-semibold mb-4">Posts by Region</h3>
                <div className="space-y-3">
                  {stats.byRegion.map((c, i) => {
                    const pct = (c.count / stats.totalPosts * 100);
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[var(--text-secondary)]">{c.name}</span>
                          <span className="text-xs font-semibold" style={{ color: ACCENT_COLORS[i % ACCENT_COLORS.length] }}>{pct.toFixed(0)}% ({c.count})</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--bg-secondary)]">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: ACCENT_COLORS[i % ACCENT_COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Content Type Mix */}
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
              <h3 className="text-sm font-semibold mb-4">Content Type Breakdown</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {stats.contentMix.map((c, i) => (
                  <div key={c.name} className="text-center p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <div className="text-2xl font-bold" style={{ color: ACCENT_COLORS[i % ACCENT_COLORS.length] }}>
                      {(c.count / stats.totalPosts * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-1 capitalize">{c.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{c.count} posts</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Hashtags */}
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
              <h3 className="text-sm font-semibold mb-4">Top Hashtags Used</h3>
              <div className="flex flex-wrap gap-2">
                {stats.topHashtags.map((h, i) => (
                  <span key={h.name} className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border)] hover:border-[var(--accent)] transition-colors cursor-pointer" style={{ color: ACCENT_COLORS[i % ACCENT_COLORS.length] }}>
                    {h.name} <span className="text-[var(--text-muted)] ml-1">({h.count})</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Insight note */}
            <div className="bg-gradient-to-r from-[var(--accent)]/5 to-purple-900/5 rounded-2xl border border-[var(--accent)]/20 p-5">
              <div className="flex items-start gap-3">
                <span className="text-xl">💡</span>
                <div>
                  <h3 className="font-semibold text-sm mb-1">Key Takeaways</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    All data is scraped live from real Instagram accounts using the Apify Instagram Scraper.
                    Every post, caption, like count, and comment count you see is real — pulled directly from {stats.totalBrands} eyewear brand
                    accounts across the globe. Use the Feed view to explore what top eyewear brands are actually posting and
                    what&apos;s driving the most engagement. Filter by category or region to find patterns.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'ai' && (
          <IntelView intel={intel} onLoad={() => {
            if (!intel) fetch('/api/intel').then(r => r.json()).then(setIntel);
          }} />
        )}

        {view === 'products' && <ProductsView />}
      </main>

      {/* Modal */}
      {selectedPost && <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />}

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 mt-16">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            EyeWear Pulse · {stats?.totalBrands || 0} brands · {stats?.totalPosts || 0} posts · Built for Lenskart
          </p>
        </div>
      </footer>
    </div>
  );
}
