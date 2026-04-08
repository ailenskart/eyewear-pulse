'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/* ── Types ── */
interface Post {
  id: string;
  brand: { name: string; handle: string; category: string; region: string; priceRange: string };
  imageUrl: string;
  videoUrl: string | null;
  carouselSlides: Array<{ url: string; type: string }>;
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
  totalPosts: number; totalBrands: number; avgEngagement: number;
  topHashtags: Array<{ name: string; count: number }>;
  contentMix: Array<{ name: string; count: number }>;
  byCategory: Array<{ name: string; count: number }>;
  byRegion: Array<{ name: string; count: number }>;
}
interface FeedResponse { posts: Post[]; total: number; page: number; totalPages: number; stats: FeedStats; }

/* ── Helpers ── */
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}
function ago(d: string): string {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000);
  if (h < 1) return 'now';
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/* ── Icons (inline SVG) ── */
const Icons = {
  home: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  search: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  shop: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  chart: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  heart: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  comment: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  send: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  x: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  play: <svg width="48" height="48" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>,
  grid: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
};

/* ── IG-style Post Card (Feed view) ── */
function FeedPost({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const [liked, setLiked] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="border-b border-[var(--border)] pb-3 mb-3 animate-[fadeIn_0.3s_ease]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
          <div className="w-full h-full rounded-full bg-[var(--bg)] flex items-center justify-center text-[10px] font-bold text-[var(--text-secondary)]">
            {post.brand.name.substring(0, 2).toUpperCase()}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">{post.brand.handle}</div>
          <div className="text-[11px] text-[var(--text-secondary)]">{post.brand.category} · {post.brand.region}</div>
        </div>
        <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--blue)] text-[13px] font-semibold">View</a>
      </div>

      {/* Image */}
      <div className="relative bg-black cursor-pointer" onClick={onOpen}>
        {imgErr ? (
          <div className="aspect-square flex items-center justify-center bg-[var(--bg-secondary)]">
            <span className="text-4xl">👓</span>
          </div>
        ) : (
          <img src={post.imageUrl} alt="" className="w-full aspect-square object-cover" loading="lazy" onError={() => setImgErr(true)} />
        )}
        {post.isVideo && post.videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center">{Icons.play}</div>
        )}
        {post.carouselSlides.length > 0 && (
          <div className="absolute top-3 right-3 bg-[var(--bg-elevated)]/80 backdrop-blur-sm text-[var(--text)] text-[11px] font-medium px-2 py-0.5 rounded-full">
            1/{post.carouselSlides.length + 1}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 px-4 pt-3 pb-1">
        <button onClick={() => setLiked(!liked)} className={`transition-transform active:scale-125 ${liked ? 'text-[var(--red)]' : ''}`}>
          {liked ? <svg width="24" height="24" fill="var(--red)" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> : Icons.heart}
        </button>
        <button onClick={onOpen}>{Icons.comment}</button>
        <button>{Icons.send}</button>
      </div>

      {/* Likes */}
      <div className="px-4 pb-1">
        <div className="text-[13px] font-semibold">{fmt(post.likes)} likes</div>
      </div>

      {/* Caption */}
      <div className="px-4 pb-1">
        <span className="text-[13px]">
          <span className="font-semibold">{post.brand.handle} </span>
          <span className="text-[var(--text)]">
            {expanded ? post.caption : post.caption.substring(0, 120)}
            {post.caption.length > 120 && !expanded && (
              <button onClick={() => setExpanded(true)} className="text-[var(--text-secondary)]"> ...more</button>
            )}
          </span>
        </span>
      </div>

      {/* Hashtags */}
      {post.hashtags.length > 0 && (
        <div className="px-4 pb-1">
          <span className="text-[13px] text-[var(--blue)]">{post.hashtags.slice(0, 5).map(h => `#${h}`).join(' ')}</span>
        </div>
      )}

      {/* Time */}
      <div className="px-4">
        <span className="text-[11px] text-[var(--text-secondary)] uppercase">{ago(post.postedAt)}</span>
      </div>
    </article>
  );
}

/* ── Grid Card (Explore view) ── */
function GridCard({ post, onClick }: { post: Post; onClick: () => void }) {
  const [err, setErr] = useState(false);
  return (
    <div className="relative aspect-square cursor-pointer group" onClick={onClick}>
      {err ? (
        <div className="w-full h-full bg-[var(--bg-secondary)] flex items-center justify-center"><span className="text-2xl">👓</span></div>
      ) : (
        <img src={post.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setErr(true)} />
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
        <div className="flex items-center gap-1.5 text-white font-bold text-sm">{Icons.heart} {fmt(post.likes)}</div>
        <div className="flex items-center gap-1.5 text-white font-bold text-sm">{Icons.comment} {fmt(post.comments)}</div>
      </div>
      {post.isVideo && <div className="absolute top-2 right-2 text-white drop-shadow-lg"><svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>}
      {post.carouselSlides.length > 0 && <div className="absolute top-2 right-2 text-white drop-shadow-lg"><svg width="16" height="16" fill="white" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="white" strokeWidth="2"/><rect x="7" y="7" width="18" height="18" rx="2" fill="none" stroke="white" strokeWidth="2"/></svg></div>}
    </div>
  );
}

/* ── Post Detail Modal (IG-style) ── */
function PostDetail({ post, onClose }: { post: Post; onClose: () => void }) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [imgErr, setImgErr] = useState(false);
  const slides = post.carouselSlides.length > 0 ? [post.imageUrl, ...post.carouselSlides.map(s => s.url)] : [post.imageUrl];

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose}>
      {/* Mobile: bottom sheet */}
      <div className="absolute inset-0 sm:flex sm:items-center sm:justify-center" onClick={e => e.stopPropagation()}>
        <div className="absolute bottom-0 sm:relative sm:bottom-auto w-full sm:max-w-[900px] bg-[var(--bg)] sm:rounded-xl overflow-hidden max-h-[92vh] sm:max-h-[85vh] flex flex-col sm:flex-row" style={{ animation: 'slideUp 0.3s ease' }}>

          {/* Close */}
          <button onClick={onClose} className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-[var(--bg-elevated)]/80 backdrop-blur flex items-center justify-center sm:hidden">{Icons.x}</button>
          <button onClick={onClose} className="hidden sm:flex absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/50 items-center justify-center text-white">{Icons.x}</button>

          {/* Media */}
          <div className="sm:w-[55%] bg-black flex-shrink-0 relative">
            {post.isVideo && post.videoUrl ? (
              <video src={post.videoUrl} controls autoPlay playsInline className="w-full aspect-square sm:aspect-auto sm:h-full object-contain" poster={post.imageUrl} />
            ) : imgErr ? (
              <div className="w-full aspect-square sm:h-full flex items-center justify-center bg-[var(--bg-secondary)]"><span className="text-5xl">👓</span></div>
            ) : (
              <img src={slides[slideIdx]} alt="" className="w-full aspect-square sm:aspect-auto sm:h-full object-cover" onError={() => setImgErr(true)} />
            )}
            {slides.length > 1 && !post.isVideo && (
              <>
                {slideIdx > 0 && <button onClick={() => setSlideIdx(i => i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 flex items-center justify-center text-sm font-bold shadow">‹</button>}
                {slideIdx < slides.length - 1 && <button onClick={() => setSlideIdx(i => i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 flex items-center justify-center text-sm font-bold shadow">›</button>}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {slides.map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === slideIdx ? 'bg-[var(--blue)]' : 'bg-white/50'}`} />)}
                </div>
              </>
            )}
          </div>

          {/* Info panel */}
          <div className="sm:w-[45%] flex flex-col overflow-y-auto">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
                <div className="w-full h-full rounded-full bg-[var(--bg)] flex items-center justify-center text-[10px] font-bold">
                  {post.brand.name.substring(0, 2).toUpperCase()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold">{post.brand.handle}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">{post.brand.name}</div>
              </div>
              <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--blue)] text-[13px] font-semibold">Open</a>
            </div>

            {/* Caption */}
            <div className="p-4 flex-1">
              <p className="text-[13px] leading-relaxed">
                <span className="font-semibold">{post.brand.handle}</span>{' '}
                {post.caption}
              </p>
              {post.hashtags.length > 0 && (
                <p className="text-[13px] text-[var(--blue)] mt-2">{post.hashtags.map(h => `#${h}`).join(' ')}</p>
              )}
              <p className="text-[11px] text-[var(--text-secondary)] mt-3 uppercase">{ago(post.postedAt)} · {post.brand.category} · {post.brand.region}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 border-t border-[var(--border)]">
              <div className="text-center py-3 border-r border-[var(--border)]">
                <div className="text-base font-bold">{fmt(post.likes)}</div>
                <div className="text-[10px] text-[var(--text-secondary)]">likes</div>
              </div>
              <div className="text-center py-3 border-r border-[var(--border)]">
                <div className="text-base font-bold">{fmt(post.comments)}</div>
                <div className="text-[10px] text-[var(--text-secondary)]">comments</div>
              </div>
              <div className="text-center py-3">
                <div className="text-base font-bold text-[var(--green)]">{post.engagement}%</div>
                <div className="text-[10px] text-[var(--text-secondary)]">engagement</div>
              </div>
            </div>

            {/* IG link */}
            <div className="p-4 border-t border-[var(--border)]">
              <a href={post.postUrl} target="_blank" rel="noopener noreferrer"
                className="block w-full py-2.5 rounded-lg bg-[var(--blue)] text-white text-[13px] font-semibold text-center">
                View on Instagram
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main ── */
export default function App() {
  const [tab, setTab] = useState<'feed' | 'explore' | 'products' | 'intel'>('feed');
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('recent');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Post | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout>>(null);

  const CATEGORIES = ['All', 'D2C', 'Luxury', 'Sports', 'Independent', 'Fast Fashion', 'Heritage', 'Streetwear', 'Sustainable', 'Tech', 'Kids'];

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ category, sortBy, search, page: String(page), limit: tab === 'feed' ? '20' : '30' });
    const res = await fetch(`/api/feed?${params}`);
    setData(await res.json());
    setLoading(false);
  }, [category, sortBy, search, page, tab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = (v: string) => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setSearch(v); setPage(1); }, 300);
  };

  const stats = data?.stats;

  if (loading && !data) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-[var(--border)] border-t-[var(--text)] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen pb-14 sm:pb-0">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-[var(--bg)] border-b border-[var(--border)]">
        <div className="max-w-[935px] mx-auto px-4 h-[60px] flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
            EyeWear Pulse
          </h1>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-6">
            {[
              { key: 'feed', icon: Icons.home, label: 'Feed' },
              { key: 'explore', icon: Icons.grid, label: 'Explore' },
              { key: 'products', icon: Icons.shop, label: 'Products' },
              { key: 'intel', icon: Icons.chart, label: 'Intel' },
            ].map(t => (
              <button key={t.key} onClick={() => { setTab(t.key as typeof tab); setPage(1); }}
                className={`flex items-center gap-2 py-1 text-sm font-medium transition-colors ${
                  tab === t.key ? 'text-[var(--text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}>
                {t.icon}
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
          </nav>

          <button onClick={() => setShowSearch(!showSearch)} className="text-[var(--text)]">{Icons.search}</button>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="px-4 pb-3 max-w-[935px] mx-auto">
            <input type="text" autoFocus onChange={e => handleSearch(e.target.value)}
              placeholder="Search brands, hashtags..."
              className="w-full bg-[var(--bg-secondary)] rounded-lg px-4 py-2.5 text-[14px] placeholder:text-[var(--text-muted)] focus:outline-none" />
          </div>
        )}
      </header>

      {/* Content */}
      <main className="max-w-[935px] mx-auto">

        {/* ── Feed Tab ── */}
        {tab === 'feed' && (
          <div className="sm:py-6">
            {/* Category pills */}
            <div className="flex gap-2 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => { setCategory(c); setPage(1); }}
                  className={`px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all ${
                    category === c
                      ? 'bg-[var(--text)] text-[var(--bg)]'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                  }`}>{c}</button>
              ))}
            </div>

            {/* Sort pills */}
            <div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {[
                { key: 'recent', label: 'Recent' },
                { key: 'likes', label: 'Most Liked' },
                { key: 'engagement', label: 'Top Engagement' },
              ].map(s => (
                <button key={s.key} onClick={() => { setSortBy(s.key); setPage(1); }}
                  className={`px-3 py-1 rounded-full text-[12px] font-medium whitespace-nowrap border transition-all ${
                    sortBy === s.key
                      ? 'border-[var(--text)] text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)]'
                  }`}>{s.label}</button>
              ))}
              <span className="flex items-center text-[12px] text-[var(--text-muted)] ml-auto whitespace-nowrap">{data?.total || 0} posts</span>
            </div>

            {/* Feed posts */}
            <div className="max-w-[470px] mx-auto">
              {data?.posts.map(post => (
                <FeedPost key={post.id} post={post} onOpen={() => setSelected(post)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Explore Tab (Grid) ── */}
        {tab === 'explore' && (
          <div>
            <div className="flex gap-2 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => { setCategory(c); setPage(1); }}
                  className={`px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all ${
                    category === c ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                  }`}>{c}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-[2px]">
              {data?.posts.map(post => (
                <GridCard key={post.id} post={post} onClick={() => setSelected(post)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Products Tab ── */}
        {tab === 'products' && <ProductsTab />}

        {/* ── Intel Tab ── */}
        {tab === 'intel' && stats && <IntelTab stats={stats} posts={data?.posts || []} />}

        {/* Pagination */}
        {(tab === 'feed' || tab === 'explore') && data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 py-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--bg-secondary)] disabled:opacity-30">Previous</button>
            <span className="text-[13px] text-[var(--text-secondary)]">{data.page} / {data.totalPages}</span>
            <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--bg-secondary)] disabled:opacity-30">Next</button>
          </div>
        )}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg)] border-t border-[var(--border)] flex justify-around py-2 pb-[env(safe-area-inset-bottom,8px)] z-50">
        {[
          { key: 'feed', icon: Icons.home },
          { key: 'explore', icon: Icons.search },
          { key: 'products', icon: Icons.shop },
          { key: 'intel', icon: Icons.chart },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key as typeof tab); setPage(1); }}
            className={`p-2 ${tab === t.key ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
            {t.icon}
          </button>
        ))}
      </nav>

      {/* Post detail modal */}
      {selected && <PostDetail post={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ── Products Tab ── */
function ProductsTab() {
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState('All');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [imgErr, setImgErr] = useState<Set<number>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams({ brand, page: String(page), limit: '30', sortBy: 'price_asc' });
    fetch(`/api/products?${params}`).then(r => r.json()).then(d => {
      setProducts(d.products || []);
      setBrands(d.brands || []);
      setTotal(d.total || 0);
    });
  }, [brand, page]);

  return (
    <div className="p-4">
      <div className="flex gap-2 pb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => { setBrand('All'); setPage(1); }}
          className={`px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap ${brand === 'All' ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}>All ({total})</button>
        {brands.slice(0, 20).map(b => (
          <button key={b} onClick={() => { setBrand(b); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap ${brand === b ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}>{b}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {products.map((p, i) => (
          <a key={i} href={String(p.url || '#')} target="_blank" rel="noopener noreferrer"
            className="bg-[var(--bg-elevated)] rounded-xl overflow-hidden border border-[var(--border)] hover:shadow-md transition-all">
            <div className="aspect-square bg-white relative">
              {imgErr.has(i) ? (
                <div className="w-full h-full flex items-center justify-center text-2xl">👓</div>
              ) : (
                <img src={String(p.image || '')} alt="" className="w-full h-full object-contain p-2" loading="lazy" onError={() => setImgErr(s => new Set(s).add(i))} />
              )}
              {Boolean(p.isNew) && <span className="absolute top-2 left-2 bg-[var(--green)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">NEW</span>}
              {Boolean(p.comparePrice) && <span className="absolute top-2 right-2 bg-[var(--red)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">SALE</span>}
            </div>
            <div className="p-3">
              <div className="text-[11px] text-[var(--text-secondary)] font-medium uppercase">{String(p.brand)}</div>
              <div className="text-[13px] font-medium mt-0.5 line-clamp-2">{String(p.name)}</div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[14px] font-bold">{String(p.price)}</span>
                {Boolean(p.comparePrice) && <span className="text-[12px] text-[var(--text-muted)] line-through">{String(p.comparePrice)}</span>}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── Intel Tab ── */
function IntelTab({ stats, posts }: { stats: FeedStats; posts: Post[] }) {
  const topPosts = [...posts].sort((a, b) => b.likes - a.likes).slice(0, 6);

  return (
    <div className="p-4 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Posts', value: fmt(stats.totalPosts) },
          { label: 'Brands', value: String(stats.totalBrands) },
          { label: 'Avg Engagement', value: `${stats.avgEngagement}%` },
          { label: 'Content Types', value: String(stats.contentMix.length) },
        ].map(s => (
          <div key={s.label} className="bg-[var(--bg-secondary)] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top posts */}
      <div>
        <h3 className="text-[15px] font-semibold mb-3">Top Performing</h3>
        <div className="grid grid-cols-3 gap-[2px] rounded-xl overflow-hidden">
          {topPosts.map(p => (
            <div key={p.id} className="relative aspect-square">
              <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <div className="text-white text-[11px] font-bold">{fmt(p.likes)} likes</div>
                <div className="text-white/70 text-[10px]">{p.brand.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div>
        <h3 className="text-[15px] font-semibold mb-3">By Category</h3>
        <div className="space-y-2">
          {stats.byCategory.map(c => (
            <div key={c.name} className="flex items-center gap-3">
              <span className="text-[13px] font-medium w-28">{c.name}</span>
              <div className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--blue)] rounded-full" style={{ width: `${(c.count / stats.totalPosts) * 100}%` }} />
              </div>
              <span className="text-[12px] text-[var(--text-secondary)] w-12 text-right">{c.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hashtags */}
      <div>
        <h3 className="text-[15px] font-semibold mb-3">Trending Hashtags</h3>
        <div className="flex flex-wrap gap-2">
          {stats.topHashtags.map(h => (
            <span key={h.name} className="px-3 py-1.5 bg-[var(--bg-secondary)] rounded-full text-[13px]">
              #{h.name} <span className="text-[var(--text-muted)]">{h.count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Regions */}
      <div>
        <h3 className="text-[15px] font-semibold mb-3">Global Coverage</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {stats.byRegion.map(r => (
            <div key={r.name} className="bg-[var(--bg-secondary)] rounded-xl p-3">
              <div className="text-[15px] font-bold">{r.count}</div>
              <div className="text-[12px] text-[var(--text-secondary)]">{r.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
