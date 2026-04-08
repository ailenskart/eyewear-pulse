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
      className="relative group cursor-pointer rounded-xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border)] animate-fade-in"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div className="aspect-square overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95]">
        {imgError ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl">
              👓
            </div>
            <span className="text-white/60 text-xs font-medium text-center">{post.brand.name}</span>
            <span className="text-white/30 text-[10px]">@{post.brand.handle}</span>
          </div>
        ) : (
          <img
            src={post.imageUrl}
            alt={post.caption}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
      </div>

      {/* Hover overlay with engagement */}
      <div className={`absolute inset-0 bg-black/60 flex items-center justify-center gap-6 transition-opacity duration-200 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        <div className="text-center">
          <div className="text-white text-lg font-bold">{formatNumber(post.likes)}</div>
          <div className="text-white/60 text-xs">likes</div>
        </div>
        <div className="text-center">
          <div className="text-white text-lg font-bold">{formatNumber(post.comments)}</div>
          <div className="text-white/60 text-xs">comments</div>
        </div>
        <div className="text-center">
          <div className="text-emerald-400 text-lg font-bold">{post.engagement}%</div>
          <div className="text-white/60 text-xs">engage</div>
        </div>
      </div>

      {/* Brand badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full pl-1 pr-2.5 py-1">
        <img
          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(post.brand.name)}&size=20&background=6366f1&color=fff&bold=true&font-size=0.5`}
          alt=""
          className="w-5 h-5 rounded-full"
        />
        <span className="text-white text-[10px] font-semibold">{post.brand.name}</span>
      </div>

      {/* Type badge */}
      {post.isVideo && post.videoUrl && (
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="absolute top-2 right-2 bg-[var(--accent)]/90 backdrop-blur-sm text-white text-[10px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1 hover:bg-[var(--accent)] transition-colors"
        >
          <span className="text-sm">&#9654;</span> Video
        </button>
      )}
      {post.isVideo && !post.videoUrl && (
        <div className="absolute top-2 right-2 bg-[var(--accent)]/80 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
          <span>&#9654;</span> Video
        </div>
      )}
      {post.carouselSlides.length > 0 && !post.isVideo && (
        <div className="absolute top-2 right-2 bg-white/20 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
          1/{post.carouselSlides.length}
        </div>
      )}

      {/* Big play button centered on video posts */}
      {post.isVideo && post.videoUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/60 transition-all group-hover:scale-110">
            <span className="text-white text-2xl ml-1">&#9654;</span>
          </div>
        </div>
      )}

      {/* Bottom info */}
      <div className="p-3">
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{post.caption}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">{post.brand.category}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">{post.type}</span>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{timeAgo(post.postedAt)}</span>
        </div>
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
  const [view, setView] = useState<'feed' | 'trends' | 'ai'>('feed');
  const [aiInsights, setAiInsights] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiType, setAiType] = useState('weekly');
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
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b border-[var(--border)]">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center text-lg">
                👓
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-white to-[var(--accent-light)] bg-clip-text text-transparent">
                  EyeWear Pulse
                </h1>
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                  Visual Instagram Intelligence — {stats?.totalBrands || 600} Brands · {stats?.totalPosts || 0} Posts
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <input
                  type="text"
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Search brands, styles, colors, hashtags..."
                  className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>

            {/* View toggle */}
            <div className="flex gap-1 bg-[var(--bg-card)] rounded-xl p-1 border border-[var(--border)]">
              <button onClick={() => setView('feed')} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'feed' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-white'}`}>Feed</button>
              <button onClick={() => setView('trends')} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'trends' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-white'}`}>Trends</button>
              <button onClick={() => setView('ai')} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'ai' ? 'bg-gradient-to-r from-[var(--accent)] to-purple-600 text-white' : 'text-[var(--text-muted)] hover:text-white'}`}>AI Intel</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-5">
        {view === 'feed' && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setShowFilters(!showFilters)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${showFilters ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]'}`}>
                Filters {showFilters ? '▲' : '▼'}
              </button>
              <div className="h-4 w-px bg-[var(--border)]" />
              {SORT_OPTIONS.map(s => (
                <FilterChip key={s.key} label={s.label} active={sortBy === s.key} onClick={() => { setSortBy(s.key); setPage(1); }} />
              ))}
              <div className="flex-1" />
              <span className="text-xs text-[var(--text-muted)]">{data?.total || 0} posts</span>
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
          <div className="space-y-6">
            {/* Embedded Gamma Report */}
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                <div>
                  <h3 className="text-sm font-semibold">Latest Intelligence Report</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Visual analysis of {stats?.totalPosts || 0} posts from {stats?.totalBrands || 0} brands</p>
                </div>
                <a href="https://gamma.app/docs/ea6wvpycpcwd7li" target="_blank" rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent-light)] hover:bg-[var(--accent)]/30 transition-colors">
                  Open in Gamma
                </a>
              </div>
              <div className="aspect-video w-full">
                <iframe
                  src="https://gamma.app/embed/ea6wvpycpcwd7li"
                  className="w-full h-full border-0"
                  allow="fullscreen"
                  title="EyeWear Pulse Intelligence Report"
                />
              </div>
            </div>

            {/* AI Report Generator */}
            <div className="bg-gradient-to-r from-[var(--accent)]/10 via-purple-900/10 to-pink-900/10 rounded-2xl border border-[var(--accent)]/30 p-6">
              <h2 className="text-lg font-bold mb-1">AI-Powered Eyewear Intelligence</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Generate custom AI reports from live data. Pick a focus area below.
              </p>
            </div>

            {/* Report type selector */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { key: 'weekly', label: 'Weekly Brief', desc: 'Trends, winners, opportunities' },
                { key: 'product', label: 'Product Intel', desc: 'Styles, materials, design recs' },
                { key: 'content', label: 'Content Strategy', desc: 'What content works best' },
                { key: 'pricing', label: 'Pricing Intel', desc: 'Pricing, promos, positioning' },
                { key: 'sentiment', label: 'Customer Signals', desc: 'Demand, sentiment, gaps' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setAiType(t.key)}
                  className={`flex-1 min-w-[200px] p-4 rounded-xl border text-left transition-all ${
                    aiType === t.key
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>

            {/* Generate button */}
            <button
              onClick={async () => {
                setAiLoading(true);
                setAiInsights('');
                try {
                  const res = await fetch(`/api/ai-insights?type=${aiType}`);
                  const data = await res.json();
                  setAiInsights(data.insights || data.error || 'No insights generated');
                } catch {
                  setAiInsights('Failed to generate insights. Set GEMINI_API_KEY env var on Vercel.');
                }
                setAiLoading(false);
              }}
              disabled={aiLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {aiLoading ? 'Analyzing with Gemma AI...' : 'Generate Report'}
            </button>

            {/* Loading state */}
            {aiLoading && (
              <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-8 text-center">
                <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-[var(--text-muted)]">Claude is analyzing {stats?.totalPosts || 0} posts across {stats?.totalBrands || 0} brands...</p>
              </div>
            )}

            {/* Results */}
            {aiInsights && !aiLoading && (
              <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">🤖</span>
                  <h3 className="font-semibold text-sm">AI Analysis</h3>
                  <span className="text-[10px] text-[var(--text-muted)] ml-auto">Powered by Gemma AI</span>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap text-sm">
                  {aiInsights}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal */}
      {selectedPost && <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />}

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-6 mt-12">
        <div className="max-w-[1600px] mx-auto px-4 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            EyeWear Pulse — Visual intelligence from {stats?.totalBrands || 600} global eyewear Instagram accounts.
            Powered by InstaTouch. Built for design intelligence.
          </p>
        </div>
      </footer>
    </div>
  );
}
