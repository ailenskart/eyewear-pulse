'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

/* ═══ Types ═══ */
interface Post {
  id: string;
  brand: { name: string; handle: string; category: string; region: string; priceRange: string };
  imageUrl: string; rawImageUrl: string; videoUrl: string | null; carouselSlides: Array<{ url: string; type: string }>;
  caption: string; likes: number; comments: number; engagement: number;
  hashtags: string[]; postedAt: string; postUrl: string; type: string; isVideo: boolean;
}
interface Stats { totalPosts: number; totalBrands: number; avgEngagement: number; topHashtags: Array<{ name: string; count: number }>; contentMix: Array<{ name: string; count: number }>; byCategory: Array<{ name: string; count: number }>; byRegion: Array<{ name: string; count: number }>; }
interface Feed { posts: Post[]; total: number; page: number; totalPages: number; stats: Stats; }

/* ═══ Util ═══ */
const n = (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : String(v);
const t = (d: string) => { const h = Math.floor((Date.now()-new Date(d).getTime())/36e5); return h<1?'now':h<24?h+'h':Math.floor(h/24)+'d'; };

/* ═══ List Carousel (tap left/right to navigate) ═══ */
function ListCarousel({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const [si, setSi] = useState(0);
  const [err, setErr] = useState(false);
  const slides = post.carouselSlides.length > 0 ? [post.imageUrl, ...post.carouselSlides.map(s => s.url)] : [post.imageUrl];

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (slides.length <= 1) { onOpen(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) setSi(i => Math.max(0, i - 1));
    else if (x > rect.width * 0.7) setSi(i => Math.min(slides.length - 1, i + 1));
    else onOpen();
  };

  return (
    <div className="relative cursor-pointer" onClick={handleTap}>
      {err ? (
        <div className="aspect-[4/5] flex items-center justify-center bg-[var(--bg-alt)] text-4xl">👓</div>
      ) : (
        <img src={slides[si]} alt="" className="w-full max-h-[70vh] object-contain" loading="lazy" onError={() => setErr(true)} />
      )}
      {slides.length > 1 && (
        <>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {slides.map((_, i) => <div key={i} className={`h-[3px] rounded-full transition-all duration-200 ${i === si ? 'bg-white w-4' : 'bg-white/40 w-1.5'}`} />)}
          </div>
          <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{si + 1}/{slides.length}</div>
        </>
      )}
    </div>
  );
}

/* ═══ Media Card (inline video + carousel) ═══ */
function MediaCard({ post, onOpen, delay }: { post: Post; onOpen: () => void; delay: number }) {
  const [si, setSi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [vidError, setVidError] = useState(false);
  const [err, setErr] = useState(false);
  const vidRef = useRef<HTMLVideoElement>(null);
  const slides = post.carouselSlides.length > 0 ? [post.imageUrl, ...post.carouselSlides.map(s => s.url)] : [post.imageUrl];
  const hasSlides = slides.length > 1;

  return (
    <div className="overflow-hidden rounded-sm sm:rounded-lg" style={{ animation: `up 0.3s ease ${delay}ms both` }}>
      {/* Media area */}
      <div className="relative aspect-square bg-[var(--bg-alt)] overflow-hidden">

        {/* Video */}
        {post.isVideo && post.videoUrl ? (
          <>
            {!playing ? (
              <div className="relative w-full h-full cursor-pointer" onClick={() => setPlaying(true)}>
                {!err ? (
                  <img src={post.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setErr(true)} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">👓</div>
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#111"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
              </div>
            ) : vidError ? (
              <div className="relative w-full h-full cursor-pointer" onClick={async () => {
                // Try to fix: fetch via server proxy + upload to Blob
                try {
                  const res = await fetch('/api/fix-media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: post.videoUrl, postId: post.id, type: 'video' }),
                  });
                  const data = await res.json();
                  if (data.blobUrl) {
                    // Reload with Blob URL
                    setVidError(false);
                    setPlaying(true);
                    // Update the video src after state change
                    setTimeout(() => { if (vidRef.current) vidRef.current.src = data.blobUrl; vidRef.current?.play(); }, 100);
                  }
                } catch { /* still broken */ }
              }}>
                {!err ? <img src={post.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setErr(true)} /> : <div className="w-full h-full flex items-center justify-center text-3xl">👓</div>}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center"><svg width="14" height="14" viewBox="0 0 24 24" fill="#111"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></div>
                  <span className="text-white text-[10px] font-medium bg-black/50 px-2 py-0.5 rounded">Tap to retry</span>
                </div>
              </div>
            ) : (
              <video ref={vidRef} src={post.videoUrl!} autoPlay playsInline loop muted className="w-full h-full object-cover" onError={() => { setVidError(true); setPlaying(false); }} onClick={() => { if (vidRef.current?.paused) vidRef.current.play(); else vidRef.current?.pause(); }} />
            )}
            {playing && (
              <button onClick={() => setPlaying(false)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center text-xs">✕</button>
            )}
          </>
        ) : (
          /* Image / Carousel — tap left/right to navigate */
          <div className="relative w-full h-full cursor-pointer" onClick={(e) => {
            if (!hasSlides) { onOpen(); return; }
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x < rect.width * 0.3) setSi(i => Math.max(0, i - 1));
            else if (x > rect.width * 0.7) setSi(i => Math.min(slides.length - 1, i + 1));
            else onOpen();
          }}>
            {!err ? (
              <img src={slides[si]} alt="" className="w-full h-full object-cover transition-opacity duration-200" loading="lazy" onError={() => setErr(true)} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">👓</div>
            )}
            {hasSlides && (
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                {slides.map((_,i) => <div key={i} className={`h-[2px] rounded-full transition-all duration-200 ${i===si ? 'bg-white w-3' : 'bg-white/40 w-1'}`}/>)}
              </div>
            )}
          </div>
        )}

        {/* Top-right badge */}
        {post.isVideo && !playing && <div className="absolute top-1.5 right-1.5 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>Video</div>}
        {hasSlides && !post.isVideo && <div className="absolute top-1.5 right-1.5 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{si+1}/{slides.length}</div>}
      </div>

      {/* Info bar */}
      <div className="p-2 sm:p-2.5 bg-[var(--surface)] border-t border-[var(--line)] cursor-pointer" onClick={onOpen}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-[12px] font-semibold truncate">{post.brand.name}</span>
          <span className="text-[10px] text-[var(--text-3)]">{t(post.postedAt)}</span>
        </div>
        <div className="flex gap-2 mt-0.5 text-[10px] text-[var(--text-3)]">
          <span className="font-medium text-[var(--text)]">{n(post.likes)}</span> likes
          <span>·</span>
          <span>{n(post.comments)} comments</span>
          <span>·</span>
          <span className="text-[var(--brand)]">{post.engagement}%</span>
        </div>
      </div>
    </div>
  );
}

/* ═══ App ═══ */
export default function App() {
  const [tab, setTab] = useState<'feed'|'products'|'intel'>('feed');
  const [mode, setMode] = useState<'grid'|'list'>('grid');
  const [data, setData] = useState<Feed|null>(null);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('All');
  const [sort, setSort] = useState('recent');
  const [q, setQ] = useState('');
  const [pg, setPg] = useState(1);
  const [open, setOpen] = useState<Post|null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  const CATS = ['All','D2C','Luxury','Sports','Independent','Fast Fashion','Streetwear','Heritage','Sustainable','Tech','Kids'];

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ category: cat, sortBy: sort, search: q, page: String(pg), limit: mode==='list'?'15':'30' });
    const r = await fetch(`/api/feed?${p}`);
    setData(await r.json());
    setLoading(false);
  }, [cat, sort, q, pg, mode]);

  useEffect(() => { load(); }, [load]);

  const search = (v: string) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { setQ(v); setPg(1); }, 300); };

  if (loading && !data) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-[var(--line)] border-t-[var(--brand)] rounded-full animate-spin"/></div>;

  return (
    <div className="min-h-screen" style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[var(--bg)] border-b border-[var(--line)]" style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', background: 'color-mix(in srgb, var(--bg) 90%, transparent)' }}>
        <div className="max-w-6xl mx-auto flex items-center h-12 px-4 gap-3">
          <h1 className="text-[15px] font-semibold whitespace-nowrap">Lenzy</h1>
          <div className="flex-1 max-w-xs ml-auto">
            <input type="text" onChange={e => search(e.target.value)} placeholder="Search brands, tags..." className="w-full bg-[var(--bg-alt)] rounded-lg px-3 py-[6px] text-[13px] placeholder:text-[var(--text-3)] outline-none border border-transparent focus:border-[var(--brand)] transition-colors" />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4">
        {/* ── Tab bar + view toggle ── */}
        {tab === 'feed' && (
          <div className="pt-3 pb-2 space-y-2">
            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {CATS.map(c => (
                <button key={c} onClick={() => { setCat(c); setPg(1); }}
                  className={`px-3 py-[5px] rounded-full text-[12px] font-medium whitespace-nowrap flex-shrink-0 transition-all ${cat===c ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}>{c}</button>
              ))}
            </div>
            {/* Sort + view toggle */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {[{k:'recent',l:'Recent'},{k:'likes',l:'Top'},{k:'engagement',l:'Trending'}].map(s => (
                  <button key={s.k} onClick={() => { setSort(s.k); setPg(1); }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase transition-all ${sort===s.k ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}>{s.l}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-3)]">{data?.total}</span>
                <div className="flex bg-[var(--bg-alt)] rounded-md p-[2px]">
                  <button onClick={() => setMode('grid')} className={`p-1 rounded ${mode==='grid' ? 'bg-[var(--surface)] shadow-sm' : ''}`}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--text-2)"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                  </button>
                  <button onClick={() => setMode('list')} className={`p-1 rounded ${mode==='list' ? 'bg-[var(--surface)] shadow-sm' : ''}`}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--text-2)"><rect x="1" y="2" width="14" height="3" rx="1"/><rect x="1" y="7" width="14" height="3" rx="1"/><rect x="1" y="12" width="14" height="3" rx="1"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Grid View ── */}
        {tab === 'feed' && mode === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-2 pb-4">
            {data?.posts.map((p, i) => (
              <MediaCard key={p.id} post={p} onOpen={() => setOpen(p)} delay={i * 15} />
            ))}
          </div>
        )}

        {/* ── List View ── */}
        {tab === 'feed' && mode === 'list' && (
          <div className="pb-4 max-w-xl mx-auto space-y-3">
            {data?.posts.map((p, i) => (
              <div key={p.id} className="rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--surface)]" style={{ animation: `up 0.3s ease ${i*25}ms both` }}>
                {/* Full-width media */}
                <div className="relative bg-[var(--bg-alt)]">
                  {p.isVideo && p.videoUrl ? (
                    <video src={p.videoUrl} controls playsInline preload="none" poster={p.imageUrl} className="w-full max-h-[70vh] object-contain" />
                  ) : (
                    <ListCarousel post={p} onOpen={() => setOpen(p)} />
                  )}
                </div>
                {/* Info */}
                <div className="p-3 cursor-pointer" onClick={() => setOpen(p)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-semibold">{p.brand.name}</span>
                    <span className="text-[11px] text-[var(--text-3)]">{t(p.postedAt)}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-2)] line-clamp-2 leading-relaxed">{p.caption}</p>
                  <div className="flex gap-3 mt-2 text-[11px]">
                    <span className="font-semibold">{n(p.likes)} likes</span>
                    <span className="text-[var(--text-3)]">{n(p.comments)} comments</span>
                    <span className="text-[var(--brand)]">{p.engagement}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Products ── */}
        {tab === 'products' && <Products />}

        {/* ── Intel ── */}
        {tab === 'intel' && data?.stats && <Intel stats={data.stats} />}

        {/* Pagination */}
        {tab === 'feed' && data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 py-6">
            <button onClick={() => setPg(p => Math.max(1,p-1))} disabled={pg===1} className="px-4 py-2 text-[13px] font-medium bg-[var(--bg-alt)] rounded-lg disabled:opacity-30">Prev</button>
            <span className="text-[13px] text-[var(--text-3)]">{data.page}/{data.totalPages}</span>
            <button onClick={() => setPg(p => Math.min(data.totalPages,p+1))} disabled={pg===data.totalPages} className="px-4 py-2 text-[13px] font-medium bg-[var(--bg-alt)] rounded-lg disabled:opacity-30">Next</button>
          </div>
        )}
      </main>

      {/* ── Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg)] border-t border-[var(--line)] flex justify-around" style={{ paddingTop: 8, paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {[
          { k: 'feed', l: 'Feed', svg: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg> },
          { k: 'products', l: 'Products', svg: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg> },
          { k: 'intel', l: 'Intel', svg: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> },
        ].map(x => (
          <button key={x.k} onClick={() => setTab(x.k as typeof tab)} className={`flex flex-col items-center gap-[2px] py-1 px-3 ${tab===x.k ? 'text-[var(--brand)]' : 'text-[var(--text-3)]'}`}>
            {x.svg}
            <span className="text-[10px] font-medium">{x.l}</span>
          </button>
        ))}
      </nav>

      {/* ── Post Detail Sheet ── */}
      {open && <Sheet post={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ═══ Detail Sheet ═══ */
function Sheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const [si, setSi] = useState(0);
  const [err, setErr] = useState(false);
  const slides = post.carouselSlides.length > 0 ? [post.imageUrl, ...post.carouselSlides.map(s => s.url)] : [post.imageUrl];

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: 'blur(8px)' }} />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-8" onClick={e => e.stopPropagation()}>
        <div className="bg-[var(--bg)] w-full sm:max-w-3xl sm:rounded-2xl overflow-hidden rounded-t-2xl sm:rounded-2xl max-h-[85vh] sm:max-h-[85vh] flex flex-col sm:flex-row shadow-2xl" style={{ animation: 'sheet 0.25s ease-out', marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>

          {/* Media — capped height on mobile so info is scrollable */}
          <div className="sm:w-[56%] bg-black relative flex-shrink-0 max-h-[45vh] sm:max-h-none overflow-hidden">
            {/* Mobile top bar */}
            <div className="sm:hidden absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 pt-3">
              <div className="bg-black/40 backdrop-blur-md rounded-full px-3 py-1">
                <span className="text-white text-[12px] font-semibold">{post.brand.name}</span>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {post.isVideo && post.videoUrl ? (
              <video src={post.videoUrl} controls autoPlay playsInline className="w-full max-h-[55vh] sm:max-h-none sm:h-full object-contain" poster={post.imageUrl} />
            ) : err ? (
              <div className="w-full aspect-[4/5] sm:h-full flex items-center justify-center bg-[var(--bg-alt)] text-4xl">👓</div>
            ) : (
              <div className="w-full max-h-[55vh] sm:max-h-none sm:h-full cursor-pointer" onClick={(e) => {
                if (slides.length <= 1) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                if (x < rect.width * 0.3) setSi(i => Math.max(0, i - 1));
                else if (x > rect.width * 0.7) setSi(i => Math.min(slides.length - 1, i + 1));
              }}>
                <img src={slides[si]} alt="" className="w-full h-full object-contain" onError={() => setErr(true)} />
              </div>
            )}
            {/* Carousel dots */}
            {slides.length > 1 && !post.isVideo && (
              <>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {slides.map((_,i) => <div key={i} className={`h-[3px] rounded-full transition-all duration-200 ${i===si ? 'bg-white w-5' : 'bg-white/40 w-1.5'}`}/>)}
                </div>
              </>
            )}
          </div>

          {/* Info — fully scrollable on mobile */}
          <div className="sm:w-[44%] flex flex-col overflow-y-auto">
            {/* Desktop close */}
            <div className="hidden sm:flex items-center justify-between p-4 border-b border-[var(--line)]">
              <div>
                <div className="text-[14px] font-semibold">{post.brand.name}</div>
                <div className="text-[12px] text-[var(--text-2)]">@{post.brand.handle} · {post.brand.category}</div>
              </div>
              <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)]">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 border-b border-[var(--line)]">
              {[{v:n(post.likes),l:'Likes'},{v:n(post.comments),l:'Comments'},{v:post.engagement+'%',l:'Engagement',c:'var(--brand)'}].map(s => (
                <div key={s.l} className="text-center py-3">
                  <div className="text-[15px] font-bold" style={s.c?{color:s.c}:{}}>{s.v}</div>
                  <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wider">{s.l}</div>
                </div>
              ))}
            </div>

            {/* Caption */}
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-[13px] leading-[1.6]">{post.caption}</p>
              {post.hashtags.length > 0 && <p className="text-[13px] text-[var(--brand)] mt-2">{post.hashtags.map(h=>'#'+h).join(' ')}</p>}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {[post.brand.category, post.brand.region, post.type, t(post.postedAt)].map(x => (
                  <span key={x} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-alt)] text-[var(--text-2)]">{x}</span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="p-3 border-t border-[var(--line)] space-y-2 flex-shrink-0">
              <a href={`/reimagine?image=${encodeURIComponent(post.rawImageUrl || post.imageUrl)}&brand=${encodeURIComponent(post.brand.name)}&caption=${encodeURIComponent(post.caption.substring(0,200))}&postUrl=${encodeURIComponent(post.postUrl)}`}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[13px] font-semibold text-center flex items-center justify-center gap-2">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                Reimagine for Lenskart
              </a>
              <div className="flex gap-2">
                <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-lg bg-[var(--brand)] text-white text-[13px] font-semibold text-center">View on IG</a>
                <a href={`https://instagram.com/${post.brand.handle}`} target="_blank" rel="noopener noreferrer" className="py-2.5 px-4 rounded-lg border border-[var(--line)] text-[13px] font-medium text-center">Profile</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Products — Instagram-style feed with download / star / reimagine ═══ */
interface ProductItem {
  id?: string | number;
  brand: string;
  name: string;
  price: string;
  image: string;
  url: string;
  type?: string;
  isNew?: boolean;
}

function Products() {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState('All');
  const [pg, setPg] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem('lenzy-saved-products') || '[]'));
    } catch { return new Set(); }
  });
  const [onlySaved, setOnlySaved] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/products?brand=${brand}&page=${pg}&limit=30&sortBy=newest`).then(r=>r.json()).then(d => {
      // Shuffle client-side so the feed mixes brands naturally (Insta-style)
      // instead of being clumped by sort order.
      const products = (d.products || []) as ProductItem[];
      const shuffled = brand === 'All' && pg === 1 ? [...products].sort(() => Math.random() - 0.5) : products;
      setItems(pg === 1 ? shuffled : [...items, ...shuffled]);
      setBrands(d.brands || []);
      setTotal(d.total || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, pg]);

  const toggleSave = (id: string) => {
    const next = new Set(savedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSavedIds(next);
    localStorage.setItem('lenzy-saved-products', JSON.stringify([...next]));
  };

  const downloadImage = async (p: ProductItem) => {
    const id = String(p.id || p.url);
    setDownloading(id);
    try {
      // Proxy through /api/img to dodge CORS on product CDNs
      const proxied = `/api/img?url=${encodeURIComponent(p.image)}`;
      const res = await fetch(proxied);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
      const slug = `${p.brand || 'product'}-${p.name || 'eyewear'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
      a.download = `${slug}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab so user can save manually
      window.open(p.image, '_blank');
    }
    setDownloading(null);
  };

  const reimagineProduct = (p: ProductItem) => {
    const params = new URLSearchParams({
      image: p.image,
      brand: p.brand,
      caption: `${p.name} — ${p.price}`,
      postUrl: p.url,
    });
    window.location.href = `/reimagine?${params.toString()}`;
  };

  const displayed = onlySaved
    ? items.filter(p => savedIds.has(String(p.id || p.url)))
    : items;

  return (
    <div className="py-4">
      {/* Brand chips + Saved toggle */}
      <div className="flex gap-2 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => setOnlySaved(s => !s)}
          className={`px-3 py-[5px] rounded-full text-[12px] font-medium whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${onlySaved ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}
        >
          <svg width="11" height="11" fill={onlySaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Saved ({savedIds.size})
        </button>
        <button
          onClick={() => { setBrand('All'); setPg(1); }}
          className={`px-3 py-[5px] rounded-full text-[12px] font-medium whitespace-nowrap flex-shrink-0 ${brand === 'All' && !onlySaved ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}
        >
          All ({total})
        </button>
        {brands.slice(0, 25).map(b => (
          <button
            key={b}
            onClick={() => { setBrand(b); setPg(1); setOnlySaved(false); }}
            className={`px-3 py-[5px] rounded-full text-[12px] font-medium whitespace-nowrap flex-shrink-0 ${brand === b ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Empty state for Saved */}
      {onlySaved && displayed.length === 0 && (
        <div className="text-center py-16 text-[var(--text-3)]">
          <svg width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="mx-auto mb-2 opacity-30"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <p className="text-[13px]">No saved products yet</p>
          <p className="text-[11px] mt-1">Tap the star icon on any product to save it here.</p>
        </div>
      )}

      {/* Insta-style feed: 1 col mobile, 2 tablet, 3 desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayed.map((p, i) => {
          const id = String(p.id || p.url);
          const saved = savedIds.has(id);
          return (
            <article
              key={id + i}
              className="bg-[var(--surface)] rounded-2xl overflow-hidden border border-[var(--line)] shadow-sm"
              style={{ animation: `up 0.35s ease ${Math.min(i, 10) * 20}ms both` }}
            >
              {/* Header: brand + price */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--brand)] to-purple-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                    {(p.brand || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{p.brand}</div>
                    {p.type && <div className="text-[10px] text-[var(--text-3)] truncate">{p.type}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {p.isNew && <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--brand)] bg-[var(--brand)]/10 px-1.5 py-0.5 rounded">New</span>}
                  <span className="text-[13px] font-bold">{p.price}</span>
                </div>
              </div>

              {/* Product image (square, full-bleed) */}
              <a
                href={p.url || '#'} target="_blank" rel="noopener noreferrer"
                className="block aspect-square bg-white relative group"
              >
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-full h-full object-contain p-6 group-hover:scale-[1.02] transition-transform duration-300"
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-[var(--text-3)] text-[11px]">No image</div>
                )}
              </a>

              {/* Action bar */}
              <div className="flex items-center gap-1 px-2 py-2 border-t border-[var(--line)]">
                <button
                  onClick={() => reimagineProduct(p)}
                  title="Reimagine with this product"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold text-[var(--brand)] hover:bg-[var(--bg-alt)] transition-colors"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  Reimagine
                </button>
                <button
                  onClick={() => toggleSave(id)}
                  title={saved ? 'Remove from saved' : 'Save'}
                  className={`p-2 rounded-lg hover:bg-[var(--bg-alt)] transition-colors ${saved ? 'text-[var(--brand)]' : 'text-[var(--text-3)]'}`}
                >
                  <svg width="16" height="16" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <button
                  onClick={() => downloadImage(p)}
                  disabled={downloading === id}
                  title="Download image"
                  className="p-2 rounded-lg hover:bg-[var(--bg-alt)] transition-colors text-[var(--text-3)] disabled:opacity-40"
                >
                  {downloading === id ? (
                    <div className="w-4 h-4 border-2 border-[var(--text-3)] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  )}
                </button>
              </div>

              {/* Caption */}
              <div className="px-4 pb-3 pt-1">
                <p className="text-[12px] leading-snug line-clamp-2">
                  <span className="font-semibold">{p.brand}</span>{' '}
                  <span className="text-[var(--text-2)]">{p.name}</span>
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {/* Load more */}
      {!onlySaved && items.length > 0 && items.length < total && (
        <div className="flex justify-center pt-6 pb-2">
          <button
            onClick={() => setPg(p => p + 1)}
            disabled={loading}
            className="px-5 py-2.5 bg-[var(--bg-alt)] rounded-full text-[12px] font-semibold hover:bg-[var(--line)] disabled:opacity-40"
          >
            {loading ? 'Loading…' : `Load more (${items.length} of ${total})`}
          </button>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex items-center justify-center py-20 text-[var(--text-3)] text-[12px]">
          <div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin mr-2" />
          Loading products…
        </div>
      )}
    </div>
  );
}

/* ═══ Intel — Marketing & Merchandising Intelligence ═══ */
interface Analysis {
  insights: Array<{ icon: string; title: string; desc: string; impact: string }>;
  contentPerformance: Array<{ type: string; count: number; avgLikes: number; pct: number }>;
  captionPerformance: Array<{ label: string; count: number; avgLikes: number }>;
  hashtagPerformance: Array<{ label: string; count: number; avgLikes: number }>;
  brandLeaderboard: Array<{ name: string; handle: string; category: string; posts: number; avgLikes: number; videos: number; carousels: number; images: number }>;
  topPosts: Array<{ brand: string; handle: string; caption: string; likes: number; comments: number; type: string; imageUrl: string; postUrl: string }>;
  categories: Array<{ name: string; posts: number; avgLikes: number; brands: number }>;
}

function Intel({ stats }: { stats: Stats }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'user'|'ai'; text: string; image?: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzeUrl, setAnalyzeUrl] = useState('');
  const [view, setView] = useState<'insights'|'chat'>('insights');
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/analysis').then(r => r.json()).then(setAnalysis);
  }, []);

  const ask = async (question: string, imageUrl?: string) => {
    if (!question.trim()) return;
    setMessages(prev => [...prev, { role: 'user', text: question, image: imageUrl }]);
    setInput('');
    setAnalyzeUrl('');
    setLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, imageUrl }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.answer || data.error || 'No response' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Failed to get response. Check API key.' }]);
    }
    setLoading(false);
    setTimeout(() => chatEnd.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const suggestions = [
    'What eyewear trends are dominating right now?',
    'Which D2C brand has the best engagement?',
    'What content strategy works best for eyewear?',
    'Compare Warby Parker vs Lenskart posting strategy',
    'What frame styles are trending this month?',
    'Which regions have the most eyewear activity?',
  ];

  return (
    <div className="py-4 space-y-4">
      {/* Toggle: Insights / AI Chat */}
      <div className="flex bg-[var(--bg-alt)] rounded-lg p-[3px] mb-4">
        <button onClick={() => setView('insights')} className={`flex-1 py-2 rounded-md text-[13px] font-medium transition-all ${view==='insights' ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'text-[var(--text-3)]'}`}>Insights</button>
        <button onClick={() => setView('chat')} className={`flex-1 py-2 rounded-md text-[13px] font-medium transition-all ${view==='chat' ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'text-[var(--text-3)]'}`}>Ask AI</button>
      </div>

      {/* ── INSIGHTS VIEW ── */}
      {view === 'insights' && analysis && (
        <div className="space-y-5">
          {/* Key Findings */}
          <div>
            <h3 className="text-[14px] font-semibold mb-2">Key Findings</h3>
            <div className="space-y-2">
              {analysis.insights.map((ins, i) => (
                <div key={i} className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 flex gap-3">
                  <span className="text-xl flex-shrink-0">{ins.icon}</span>
                  <div>
                    <div className="text-[13px] font-semibold flex items-center gap-2">
                      {ins.title}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${ins.impact==='high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ins.impact==='medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>{ins.impact}</span>
                    </div>
                    <p className="text-[12px] text-[var(--text-2)] mt-0.5 leading-relaxed">{ins.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Content Type Performance */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
            <h3 className="text-[13px] font-semibold mb-3">What content type works?</h3>
            {analysis.contentPerformance.map((c, i) => {
              const maxLikes = Math.max(...analysis.contentPerformance.map(x => x.avgLikes));
              const colors = ['var(--brand)', '#3b82f6', '#8b5cf6', '#6b7280'];
              return (
                <div key={c.type} className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium">{c.type} <span className="text-[var(--text-3)] font-normal">({c.count} posts)</span></span>
                    <span className="text-[12px] font-bold" style={{ color: colors[i] }}>{n(c.avgLikes)} avg</span>
                  </div>
                  <div className="h-2 bg-[var(--bg-alt)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(c.avgLikes / maxLikes) * 100}%`, background: colors[i] }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Caption + Hashtag side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
              <h3 className="text-[13px] font-semibold mb-2">Caption length matters</h3>
              {analysis.captionPerformance.map(c => {
                const max = Math.max(...analysis.captionPerformance.map(x => x.avgLikes));
                return (
                  <div key={c.label} className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] w-28 text-[var(--text-2)]">{c.label}</span>
                    <div className="flex-1 h-[5px] bg-[var(--bg-alt)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--brand)] rounded-full" style={{ width: `${(c.avgLikes / max) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-bold w-12 text-right">{n(c.avgLikes)}</span>
                  </div>
                );
              })}
            </div>
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
              <h3 className="text-[13px] font-semibold mb-2">Hashtag count sweet spot</h3>
              {analysis.hashtagPerformance.map(h => {
                const max = Math.max(...analysis.hashtagPerformance.map(x => x.avgLikes));
                return (
                  <div key={h.label} className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] w-20 text-[var(--text-2)]">{h.label}</span>
                    <div className="flex-1 h-[5px] bg-[var(--bg-alt)] rounded-full overflow-hidden">
                      <div className="h-full bg-[#3b82f6] rounded-full" style={{ width: `${(h.avgLikes / max) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-bold w-12 text-right">{n(h.avgLikes)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Brand Leaderboard */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
            <div className="p-3 border-b border-[var(--line)]">
              <h3 className="text-[13px] font-semibold">Who&apos;s winning? (by avg likes/post)</h3>
            </div>
            {analysis.brandLeaderboard.slice(0, 10).map((b, i) => (
              <div key={b.handle} className="flex items-center gap-2.5 px-3 py-2 border-b border-[var(--line)] last:border-0">
                <span className="text-[14px] font-bold w-6 text-center" style={{ color: i < 3 ? 'var(--brand)' : 'var(--text-3)' }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold">{b.name} <span className="text-[10px] text-[var(--text-3)] font-normal">{b.category}</span></div>
                  <div className="text-[10px] text-[var(--text-3)]">{b.posts} posts · V:{b.videos} C:{b.carousels} I:{b.images}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold">{n(b.avgLikes)}</div>
                  <div className="text-[9px] text-[var(--text-3)]">avg/post</div>
                </div>
              </div>
            ))}
          </div>

          {/* Category Performance */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
            <h3 className="text-[13px] font-semibold mb-2">Category engagement ranking</h3>
            {analysis.categories.map((c, i) => (
              <div key={c.name} className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] w-28 text-[var(--text-2)]">{c.name}</span>
                <div className="flex-1 h-[5px] bg-[var(--bg-alt)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--brand)] rounded-full" style={{ width: `${(c.avgLikes / Math.max(...analysis.categories.map(x => x.avgLikes))) * 100}%`, opacity: 1 - i * 0.06 }} />
                </div>
                <span className="text-[10px] font-bold w-16 text-right">{n(c.avgLikes)} avg</span>
              </div>
            ))}
          </div>

          {/* Hashtags + Regions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
              <h3 className="text-[13px] font-semibold mb-2">Trending tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {stats.topHashtags.map(h => (
                  <span key={h.name} className="px-2 py-0.5 bg-[var(--bg-alt)] rounded-full text-[11px]">#{h.name} <span className="text-[var(--text-3)]">{h.count}</span></span>
                ))}
              </div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
              <h3 className="text-[13px] font-semibold mb-2">Regions</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {stats.byRegion.map(r => (
                  <div key={r.name} className="bg-[var(--bg-alt)] rounded-lg p-2 flex items-center justify-between">
                    <span className="text-[11px] text-[var(--text-2)]">{r.name}</span>
                    <span className="text-[12px] font-bold">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'insights' && !analysis && (
        <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-[var(--line)] border-t-[var(--brand)] rounded-full animate-spin"/></div>
      )}

      {/* ── CHAT VIEW ── */}
      {view === 'chat' && (
      <>

      {/* AI Chat */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--line)] overflow-hidden">
        <div className="p-3 border-b border-[var(--line)] flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[var(--brand)] flex items-center justify-center">
            <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
          </div>
          <span className="text-[13px] font-semibold">Ask about eyewear trends</span>
          <span className="text-[10px] text-[var(--text-3)] ml-auto">Powered by Gemma AI</span>
        </div>

        {/* Messages */}
        <div className="max-h-[400px] overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-[12px] text-[var(--text-3)]">Ask anything about the {stats.totalPosts} posts from {stats.totalBrands} eyewear brands. Or paste an image URL to analyze a post.</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map(s => (
                  <button key={s} onClick={() => ask(s)} className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-alt)] text-[11px] text-[var(--text-2)] hover:bg-[var(--brand)] hover:text-white transition-colors text-left">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'ai' && <div className="w-6 h-6 rounded-full bg-[var(--brand)] flex-shrink-0 flex items-center justify-center mt-0.5"><svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>}
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${m.role === 'user' ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-alt)]'}`}>
                {m.image && <img src={m.image} alt="" className="w-20 h-20 rounded-lg object-cover mb-2" />}
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-[var(--brand)] flex-shrink-0 flex items-center justify-center"><svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>
              <div className="bg-[var(--bg-alt)] rounded-xl px-3 py-2 flex gap-1">
                <div className="w-2 h-2 rounded-full bg-[var(--text-3)] animate-bounce" style={{animationDelay:'0ms'}} />
                <div className="w-2 h-2 rounded-full bg-[var(--text-3)] animate-bounce" style={{animationDelay:'150ms'}} />
                <div className="w-2 h-2 rounded-full bg-[var(--text-3)] animate-bounce" style={{animationDelay:'300ms'}} />
              </div>
            </div>
          )}
          <div ref={chatEnd} />
        </div>

        {/* Image URL input (for vision analysis) */}
        {analyzeUrl && (
          <div className="px-3 pb-2 flex items-center gap-2">
            <img src={analyzeUrl} alt="" className="w-10 h-10 rounded object-cover" />
            <span className="text-[11px] text-[var(--text-2)] flex-1 truncate">{analyzeUrl}</span>
            <button onClick={() => setAnalyzeUrl('')} className="text-[var(--text-3)] text-xs">Remove</button>
          </div>
        )}

        {/* Input */}
        <div className="p-2 border-t border-[var(--line)] flex gap-2">
          <button onClick={() => { const url = prompt('Paste image URL to analyze:'); if (url) setAnalyzeUrl(url); }}
            className="p-2 rounded-lg bg-[var(--bg-alt)] text-[var(--text-2)] flex-shrink-0" title="Analyze image">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
          </button>
          <input
            type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input, analyzeUrl || undefined); }}}
            placeholder="Ask about trends, brands, strategies..."
            className="flex-1 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[13px] outline-none placeholder:text-[var(--text-3)]"
          />
          <button onClick={() => ask(input, analyzeUrl || undefined)} disabled={!input.trim() || loading}
            className="p-2 rounded-lg bg-[var(--brand)] text-white flex-shrink-0 disabled:opacity-40">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>

      </>
      )}
    </div>
  );
}
