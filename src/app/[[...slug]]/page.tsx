'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';

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
type Tab = 'feed' | 'products' | 'boards' | 'ads' | 'watchlist' | 'intel' | 'brand' | 'sources' | 'news' | 'celebrities';

export default function App() {
  const router = useRouter();
  const params = useParams<{ slug?: string[] }>();

  // Derive the current tab + any deep-link ID from the URL.
  //   /                    → feed
  //   /products            → products
  //   /products/<id>       → products + focused product
  //   /boards              → board list
  //   /boards/<id>         → specific board view
  //   /ads                 → Meta Ad Library
  //   /watchlist           → tracked-brand feed
  //   /brands/<handle>     → per-brand detail page
  //   /intel               → intel
  const slug = (params?.slug || []) as string[];
  const tab: Tab = useMemo(() => {
    const first = slug[0]?.toLowerCase();
    if (first === 'products') return 'products';
    if (first === 'boards') return 'boards';
    if (first === 'ads') return 'ads';
    if (first === 'watchlist') return 'watchlist';
    if (first === 'intel') return 'intel';
    if (first === 'brands') return 'brand';
    if (first === 'sources') return 'sources';
    if (first === 'news') return 'news';
    if (first === 'celebrities' || first === 'celebs') return 'celebrities';
    return 'feed';
  }, [slug]);
  const focusedProductId = slug[0]?.toLowerCase() === 'products' ? (slug[1] || null) : null;
  const focusedBoardId = slug[0]?.toLowerCase() === 'boards' ? (slug[1] || null) : null;
  const focusedBrandHandle = slug[0]?.toLowerCase() === 'brands' ? (slug[1] || null) : null;

  const setTab = (next: Tab) => {
    if (next === 'feed') router.push('/');
    else router.push(`/${next}`);
  };

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
        {tab === 'products' && <Products focusedId={focusedProductId} />}

        {/* ── Boards ── */}
        {tab === 'boards' && <Boards focusedBoardId={focusedBoardId} />}

        {/* ── Meta Ad Library ── */}
        {tab === 'ads' && <AdLibrary />}

        {/* ── News digest ── */}
        {tab === 'news' && <News />}

        {/* ── Celebrities ── */}
        {tab === 'celebrities' && <Celebrities />}

        {/* ── Intelligence Sources ── */}
        {tab === 'sources' && <Sources />}

        {/* ── Watchlist ── */}
        {tab === 'watchlist' && <Watchlist onOpen={setOpen} />}

        {/* ── Per-brand detail ── */}
        {tab === 'brand' && focusedBrandHandle && <BrandDetail handle={focusedBrandHandle} onOpen={setOpen} />}

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
          { k: 'feed', l: 'Feed', svg: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg> },
          { k: 'news', l: 'News', svg: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/></svg> },
          { k: 'celebrities', l: 'Celebs', svg: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5 1 6-5.5-3-5.5 3 1-6L3 9l6-1 3-6z"/></svg> },
          { k: 'sources', l: 'Intel', svg: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> },
          { k: 'products', l: 'Shop', svg: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg> },
          { k: 'watchlist', l: 'Watch', svg: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg> },
          { k: 'boards', l: 'Boards', svg: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
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
  const [showBoardPicker, setShowBoardPicker] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [brief, setBrief] = useState<string>('');
  const slides = post.carouselSlides.length > 0 ? [post.imageUrl, ...post.carouselSlides.map(s => s.url)] : [post.imageUrl];

  const generateBrief = async () => {
    setBriefLoading(true);
    setBrief('');
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: post.rawImageUrl || post.imageUrl,
          caption: post.caption,
          brand: post.brand.name,
        }),
      });
      const data = await res.json();
      setBrief(data.brief || data.error || 'Brief generation failed');
    } catch {
      setBrief('Network error');
    }
    setBriefLoading(false);
  };

  const addPostToBoard = (boardId: string) => {
    const boards = loadBoards();
    const item: BoardItem = {
      id: `post_${post.id}_${Date.now().toString(36)}`,
      kind: 'post',
      imageUrl: post.rawImageUrl || post.imageUrl,
      caption: post.caption.substring(0, 300),
      brand: post.brand.name,
      sourceUrl: post.postUrl,
      addedAt: new Date().toISOString(),
    };
    saveBoards(boards.map(b => b.id === boardId ? { ...b, items: [item, ...b.items] } : b));
    setShowBoardPicker(false);
  };

  const createBoardWithPost = (title: string) => {
    const boards = loadBoards();
    const board: Board = {
      id: Date.now().toString(36),
      title: title.trim() || 'Untitled board',
      items: [{
        id: `post_${post.id}_${Date.now().toString(36)}`,
        kind: 'post',
        imageUrl: post.rawImageUrl || post.imageUrl,
        caption: post.caption.substring(0, 300),
        brand: post.brand.name,
        sourceUrl: post.postUrl,
        addedAt: new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
    };
    saveBoards([board, ...boards]);
    setShowBoardPicker(false);
  };

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

            {/* AI Brief output */}
            {brief && (
              <div className="px-4 pb-4 flex-shrink-0">
                <div className="bg-[var(--bg-alt)] rounded-lg p-3 max-h-[300px] overflow-y-auto">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--brand)] mb-1">AI Brief</div>
                  <div className="text-[11px] leading-relaxed whitespace-pre-wrap">{brief}</div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-3 border-t border-[var(--line)] space-y-2 flex-shrink-0">
              <a href={`/reimagine?image=${encodeURIComponent(post.rawImageUrl || post.imageUrl)}&brand=${encodeURIComponent(post.brand.name)}&caption=${encodeURIComponent(post.caption.substring(0,200))}&postUrl=${encodeURIComponent(post.postUrl)}`}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white text-[13px] font-semibold text-center flex items-center justify-center gap-2">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                Reimagine for Lenskart
              </a>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={generateBrief} disabled={briefLoading} className="py-2 rounded-lg bg-[var(--bg-alt)] text-[12px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {briefLoading ? (
                    <div className="w-3 h-3 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="13" y2="11"/></svg>
                  )}
                  {briefLoading ? 'Writing…' : 'AI Brief'}
                </button>
                <button onClick={() => setShowBoardPicker(true)} className="py-2 rounded-lg bg-[var(--bg-alt)] text-[12px] font-semibold flex items-center justify-center gap-1.5">
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  Save to board
                </button>
              </div>
              <div className="flex gap-2">
                <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-lg bg-[var(--brand)] text-white text-[13px] font-semibold text-center">View on IG</a>
                <a href={`https://instagram.com/${post.brand.handle}`} target="_blank" rel="noopener noreferrer" className="py-2.5 px-4 rounded-lg border border-[var(--line)] text-[13px] font-medium text-center">Profile</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showBoardPicker && (
        <BoardPicker
          item={{ brand: post.brand.name, caption: post.caption, imageUrl: post.rawImageUrl || post.imageUrl }}
          onAdd={addPostToBoard}
          onCreate={createBoardWithPost}
          onClose={() => setShowBoardPicker(false)}
        />
      )}
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

/** Unbiased Fisher–Yates shuffle (in place, returns the array). */
function fisherYates<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Spread items so no two consecutive items share the same brand when
 * possible. Works by repeatedly popping from the largest remaining
 * brand bucket, skipping the last-placed brand until it's unavoidable.
 * This is what Instagram / TikTok do to mix creators in a feed.
 */
function spreadByBrand<T extends { brand: string }>(items: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const key = it.brand || '__unknown__';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(it);
  }
  // Shuffle within each bucket so the same brand's items aren't in catalog order
  for (const list of buckets.values()) fisherYates(list);

  const out: T[] = [];
  let lastBrand = '';
  while (buckets.size > 0) {
    // Find the largest bucket whose brand != lastBrand, else the largest overall
    let pickKey = '';
    let pickSize = -1;
    for (const [key, list] of buckets) {
      if (key === lastBrand) continue;
      if (list.length > pickSize) { pickKey = key; pickSize = list.length; }
    }
    if (!pickKey) {
      // Only the lastBrand bucket remains — drain it
      pickKey = lastBrand;
    }
    const list = buckets.get(pickKey)!;
    out.push(list.shift()!);
    if (list.length === 0) buckets.delete(pickKey);
    lastBrand = pickKey;
  }
  return out;
}

function Products({ focusedId }: { focusedId: string | null }) {
  const [allItems, setAllItems] = useState<ProductItem[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState('All');
  const [total, setTotal] = useState(0);
  const [visible, setVisible] = useState(30);
  const [loading, setLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem('lenzy-saved-products') || '[]'));
    } catch { return new Set(); }
  });
  const [onlySaved, setOnlySaved] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [boardPickerFor, setBoardPickerFor] = useState<ProductItem | null>(null);

  // When landing on /products/<id>, fetch that specific product so the
  // deep-link works even before the brand pool finishes loading.
  const [focused, setFocused] = useState<ProductItem | null>(null);
  useEffect(() => {
    setFocused(null);
    if (!focusedId) return;
    fetch(`/api/products?id=${encodeURIComponent(focusedId)}&limit=1`).then(r=>r.json()).then(d => {
      const match = (d.products || []).find((p: ProductItem) => String(p.id || p.url) === focusedId);
      if (match) setFocused(match);
    }).catch(() => {});
  }, [focusedId]);

  useEffect(() => {
    setLoading(true);
    setVisible(30);
    // When "All" is selected, use the mix=1 per-brand sampling endpoint
    // so every brand gets equal representation regardless of how many
    // products each has in the DB. Without this, one dominant brand
    // (e.g. Knockaround with ~80% of all rows) would fill the feed.
    const url = brand === 'All'
      ? `/api/products?mix=1&limit=40`
      : `/api/products?brand=${encodeURIComponent(brand)}&page=1&limit=200&sortBy=newest`;
    fetch(url).then(r=>r.json()).then(d => {
      const products = (d.products || []) as ProductItem[];
      // Fisher–Yates shuffle, then spread by brand so no two adjacent
      // cards are from the same brand when possible.
      const mixed = spreadByBrand(fisherYates([...products]));
      setAllItems(mixed);
      setBrands(d.brands || []);
      setTotal(d.total || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [brand]);

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

  const addToBoard = (p: ProductItem, boardId: string) => {
    const boards = loadBoards();
    const item: BoardItem = {
      id: `prod_${p.id || p.url}_${Date.now().toString(36)}`,
      kind: 'product',
      imageUrl: p.image,
      caption: `${p.brand} — ${p.name}${p.price ? ` (${p.price})` : ''}`,
      brand: p.brand,
      type: p.type,
      sourceUrl: p.url,
      addedAt: new Date().toISOString(),
    };
    saveBoards(boards.map(b => b.id === boardId ? { ...b, items: [item, ...b.items] } : b));
    setBoardPickerFor(null);
  };

  const createBoardWith = (title: string, p: ProductItem) => {
    const boards = loadBoards();
    const board: Board = {
      id: Date.now().toString(36),
      title: title.trim() || 'Untitled board',
      items: [{
        id: `prod_${p.id || p.url}_${Date.now().toString(36)}`,
        kind: 'product',
        imageUrl: p.image,
        caption: `${p.brand} — ${p.name}${p.price ? ` (${p.price})` : ''}`,
        brand: p.brand,
        type: p.type,
        sourceUrl: p.url,
        addedAt: new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
    };
    saveBoards([board, ...boards]);
    setBoardPickerFor(null);
  };

  const shareProduct = async (p: ProductItem) => {
    const id = String(p.id || p.url);
    const deepLink = `${window.location.origin}/products/${encodeURIComponent(id)}`;
    const text = `${p.brand} — ${p.name}${p.price ? ` (${p.price})` : ''}`;
    // Prefer the native Web Share API (mobile), fall back to clipboard copy
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: { title: string; text: string; url: string }) => Promise<void> }).share({
          title: `Lenzy · ${p.brand}`,
          text,
          url: deepLink,
        });
        return;
      } catch {
        // user dismissed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(deepLink);
      setSharedId(id);
      setTimeout(() => setSharedId(null), 1600);
    } catch {
      window.prompt('Copy this link to share:', deepLink);
    }
  };

  // If we arrived at /products/<id>, prepend the focused product (if loaded)
  // so it renders at the top of the feed with a highlighted border.
  const pool = onlySaved
    ? allItems.filter(p => savedIds.has(String(p.id || p.url)))
    : (focused ? [focused, ...allItems.filter(p => String(p.id || p.url) !== focusedId)] : allItems);
  const displayed = pool.slice(0, visible);
  const canLoadMore = !onlySaved && visible < pool.length;

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
          onClick={() => { setBrand('All'); setOnlySaved(false); }}
          className={`px-3 py-[5px] rounded-full text-[12px] font-medium whitespace-nowrap flex-shrink-0 ${brand === 'All' && !onlySaved ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}
        >
          All ({total})
        </button>
        {brands.slice(0, 25).map(b => (
          <button
            key={b}
            onClick={() => { setBrand(b); setOnlySaved(false); }}
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
              className={`bg-[var(--surface)] rounded-2xl overflow-hidden border shadow-sm ${focusedId === id ? 'border-[var(--brand)] ring-2 ring-[var(--brand)]/30' : 'border-[var(--line)]'}`}
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
                  onClick={() => shareProduct(p)}
                  title={sharedId === id ? 'Link copied!' : 'Share product'}
                  className={`p-2 rounded-lg hover:bg-[var(--bg-alt)] transition-colors ${sharedId === id ? 'text-[var(--brand)]' : 'text-[var(--text-3)]'}`}
                >
                  {sharedId === id ? (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  )}
                </button>
                <button
                  onClick={() => toggleSave(id)}
                  title={saved ? 'Remove from saved' : 'Save'}
                  className={`p-2 rounded-lg hover:bg-[var(--bg-alt)] transition-colors ${saved ? 'text-[var(--brand)]' : 'text-[var(--text-3)]'}`}
                >
                  <svg width="16" height="16" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <button
                  onClick={() => setBoardPickerFor(p)}
                  title="Add to board"
                  className="p-2 rounded-lg hover:bg-[var(--bg-alt)] transition-colors text-[var(--text-3)]"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
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
      {canLoadMore && (
        <div className="flex justify-center pt-6 pb-2">
          <button
            onClick={() => setVisible(v => v + 30)}
            className="px-5 py-2.5 bg-[var(--bg-alt)] rounded-full text-[12px] font-semibold hover:bg-[var(--line)]"
          >
            Load more ({displayed.length} of {pool.length})
          </button>
        </div>
      )}

      {loading && allItems.length === 0 && (
        <div className="flex items-center justify-center py-20 text-[var(--text-3)] text-[12px]">
          <div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin mr-2" />
          Loading products…
        </div>
      )}

      {/* Board picker modal */}
      {boardPickerFor && (
        <BoardPicker
          item={boardPickerFor}
          onAdd={(boardId) => addToBoard(boardPickerFor, boardId)}
          onCreate={(title) => createBoardWith(title, boardPickerFor)}
          onClose={() => setBoardPickerFor(null)}
        />
      )}
    </div>
  );
}

/* ═══ Shared board picker modal ═══ */
function BoardPicker({
  item, onAdd, onCreate, onClose,
}: {
  item: { brand: string; name?: string; caption?: string; image?: string; imageUrl?: string };
  onAdd: (boardId: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}) {
  const [boards, setBoardsList] = useState<Board[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { setBoardsList(loadBoards()); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[var(--surface)] w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl border border-[var(--line)] p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-semibold">Add to board</div>
          <button onClick={onClose} className="text-[var(--text-3)] text-[20px] leading-none px-1">×</button>
        </div>
        <div className="flex items-center gap-2 p-2 bg-[var(--bg-alt)] rounded-lg mb-3">
          <img src={item.image || item.imageUrl || ''} alt="" className="w-10 h-10 rounded object-cover bg-white flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="flex-1 min-w-0 text-[11px]">
            <div className="font-semibold truncate">{item.brand}</div>
            <div className="text-[var(--text-3)] truncate">{item.name || item.caption}</div>
          </div>
        </div>

        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--bg-alt)] rounded-lg text-[12px] font-semibold mb-2 hover:bg-[var(--line)]"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            Create new board
          </button>
        )}
        {creating && (
          <div className="flex gap-2 mb-2">
            <input
              type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              autoFocus placeholder="Board name…"
              className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none"
              onKeyDown={e => { if (e.key === 'Enter' && newTitle.trim()) { onCreate(newTitle); } }}
            />
            <button onClick={() => { if (newTitle.trim()) onCreate(newTitle); }} className="px-3 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">Create</button>
          </div>
        )}

        {boards.length > 0 && (
          <div className="max-h-60 overflow-y-auto space-y-1">
            {boards.map(b => (
              <button
                key={b.id}
                onClick={() => onAdd(b.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-alt)] text-left"
              >
                <div className="w-8 h-8 bg-[var(--bg-alt)] rounded grid grid-cols-2 grid-rows-2 gap-[1px] overflow-hidden flex-shrink-0">
                  {b.items.slice(0, 4).map((it, i) => (
                    <img key={i} src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold truncate">{b.title}</div>
                  <div className="text-[10px] text-[var(--text-3)]">{b.items.length} item{b.items.length !== 1 ? 's' : ''}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ Boards — Swipe file / mood boards with per-item rating + notes ═══ */

interface BoardItem {
  id: string;
  kind: 'post' | 'product';
  imageUrl: string;
  caption: string;
  brand: string;
  type?: string;
  sourceUrl?: string;
  addedAt: string;
  rating?: number; // 1-5
  note?: string;
}

interface Board {
  id: string;
  title: string;
  description?: string;
  items: BoardItem[];
  createdAt: string;
}

function loadBoards(): Board[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('lenzy-boards');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveBoards(boards: Board[]) {
  localStorage.setItem('lenzy-boards', JSON.stringify(boards));
}

function Boards({ focusedBoardId }: { focusedBoardId: string | null }) {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [brief, setBrief] = useState<string>('');
  const [briefAngle, setBriefAngle] = useState('');

  useEffect(() => { setBoards(loadBoards()); }, []);

  const persist = (next: Board[]) => { setBoards(next); saveBoards(next); };

  const createBoard = () => {
    const title = newTitle.trim() || 'Untitled board';
    const b: Board = {
      id: Date.now().toString(36),
      title,
      items: [],
      createdAt: new Date().toISOString(),
    };
    persist([b, ...boards]);
    setNewTitle('');
    setCreating(false);
    router.push(`/boards/${b.id}`);
  };

  const deleteBoard = (id: string) => {
    if (!confirm('Delete this board? Items inside will be removed.')) return;
    persist(boards.filter(b => b.id !== id));
    if (focusedBoardId === id) router.push('/boards');
  };

  const removeItem = (boardId: string, itemId: string) => {
    persist(boards.map(b => b.id === boardId ? { ...b, items: b.items.filter(i => i.id !== itemId) } : b));
  };

  const updateItem = (boardId: string, itemId: string, patch: Partial<BoardItem>) => {
    persist(boards.map(b => b.id === boardId
      ? { ...b, items: b.items.map(i => i.id === itemId ? { ...i, ...patch } : i) }
      : b));
  };

  const shareBoard = async (b: Board) => {
    const link = `${window.location.origin}/boards/${b.id}`;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: { title: string; url: string }) => Promise<void> }).share({
          title: `Lenzy Board · ${b.title}`,
          url: link,
        });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(link);
      alert('Board link copied!');
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  const generateBoardBrief = async (b: Board) => {
    setBriefLoading(true);
    setBrief('');
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardTitle: b.title,
          items: b.items.map(i => ({
            imageUrl: i.imageUrl,
            caption: i.caption,
            brand: i.brand,
            type: i.kind,
          })),
          angle: briefAngle.trim() || undefined,
        }),
      });
      const data = await res.json();
      setBrief(data.brief || data.error || 'Brief generation failed');
    } catch {
      setBrief('Network error');
    }
    setBriefLoading(false);
  };

  const focused = focusedBoardId ? boards.find(b => b.id === focusedBoardId) : null;

  // ── Individual board view ──
  if (focused) {
    return (
      <div className="py-4">
        {/* Board header */}
        <div className="flex items-start gap-3 mb-4">
          <button onClick={() => router.push('/boards')} className="text-[var(--text-2)] p-1 flex-shrink-0">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[22px] font-bold tracking-tight">{focused.title}</h2>
            <div className="text-[11px] text-[var(--text-3)] mt-0.5">{focused.items.length} item{focused.items.length !== 1 ? 's' : ''} · created {new Date(focused.createdAt).toLocaleDateString()}</div>
          </div>
          <button onClick={() => shareBoard(focused)} className="px-3 py-1.5 bg-[var(--bg-alt)] rounded-lg text-[11px] font-semibold flex items-center gap-1.5">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <button onClick={() => deleteBoard(focused.id)} className="p-1.5 text-[var(--text-3)]">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>

        {/* AI Brief generator */}
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-[var(--brand)]"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <div className="text-[12px] font-semibold">Generate creative brief from this board</div>
          </div>
          <div className="flex gap-2">
            <input
              type="text" value={briefAngle} onChange={e => setBriefAngle(e.target.value)}
              placeholder="Optional angle — e.g. 'target Gen Z on TikTok'"
              className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none placeholder:text-[var(--text-3)]"
            />
            <button
              onClick={() => generateBoardBrief(focused)}
              disabled={briefLoading || focused.items.length === 0}
              className="px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg disabled:opacity-40 flex-shrink-0"
            >
              {briefLoading ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {brief && (
            <div className="mt-3 max-h-[500px] overflow-y-auto bg-[var(--bg-alt)] rounded-lg p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
              {brief}
            </div>
          )}
        </div>

        {/* Items */}
        {focused.items.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-3)]">
            <p className="text-[13px]">This board is empty</p>
            <p className="text-[11px] mt-1">Open any post or product and tap the board icon to add it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {focused.items.map(it => (
              <div key={it.id} className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--line)]">
                  <div className="text-[11px] font-semibold truncate">{it.brand}</div>
                  <span className="text-[9px] text-[var(--text-3)] uppercase tracking-wider">{it.kind}</span>
                </div>
                <img src={it.imageUrl} alt={it.caption} className="w-full aspect-square object-cover bg-[var(--bg)]" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div className="p-3 space-y-2">
                  <p className="text-[11px] text-[var(--text-2)] line-clamp-2 leading-snug">{it.caption}</p>
                  {/* Rating */}
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => updateItem(focused.id, it.id, { rating: it.rating === n ? 0 : n })} className="p-0.5">
                        <svg width="14" height="14" fill={(it.rating || 0) >= n ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className={(it.rating || 0) >= n ? 'text-[var(--brand)]' : 'text-[var(--text-3)]'}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      </button>
                    ))}
                  </div>
                  {/* Note */}
                  <input
                    type="text" value={it.note || ''}
                    onChange={e => updateItem(focused.id, it.id, { note: e.target.value })}
                    placeholder="Add a note…"
                    className="w-full bg-[var(--bg-alt)] rounded-md px-2 py-1.5 text-[11px] outline-none placeholder:text-[var(--text-3)]"
                  />
                  <div className="flex gap-1">
                    {it.sourceUrl && (
                      <a href={it.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center py-1.5 bg-[var(--bg-alt)] rounded text-[10px] font-semibold text-[var(--text-2)]">View source</a>
                    )}
                    <button onClick={() => removeItem(focused.id, it.id)} className="px-2 py-1.5 bg-[var(--bg-alt)] rounded text-[10px] text-[var(--text-3)]">Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Board list view ──
  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Boards</h2>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5">Swipe files for your next campaign</p>
        </div>
        <button onClick={() => setCreating(true)} className="px-3 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg flex items-center gap-1.5">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          New board
        </button>
      </div>

      {creating && (
        <div className="bg-[var(--surface)] border border-[var(--brand)] rounded-xl p-3 mb-4 flex gap-2">
          <input
            type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
            autoFocus placeholder="Board name — e.g. 'Q2 summer campaign inspo'"
            className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none"
            onKeyDown={e => { if (e.key === 'Enter') createBoard(); }}
          />
          <button onClick={createBoard} className="px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">Create</button>
          <button onClick={() => { setCreating(false); setNewTitle(''); }} className="px-2 text-[11px] text-[var(--text-3)]">Cancel</button>
        </div>
      )}

      {boards.length === 0 && !creating ? (
        <div className="text-center py-16 text-[var(--text-3)]">
          <svg width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="mx-auto mb-2 opacity-30"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          <p className="text-[13px]">No boards yet</p>
          <p className="text-[11px] mt-1">Create a board to start collecting posts and products.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map(b => (
            <button
              key={b.id}
              onClick={() => router.push(`/boards/${b.id}`)}
              className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden text-left hover:border-[var(--brand)] transition-colors"
            >
              {/* Cover — 2x2 grid of first 4 items, or placeholder */}
              <div className="aspect-[16/10] bg-[var(--bg-alt)] grid grid-cols-2 grid-rows-2 gap-[1px]">
                {b.items.slice(0, 4).map((it, i) => (
                  <img key={i} src={it.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ))}
                {b.items.length === 0 && (
                  <div className="col-span-2 row-span-2 flex items-center justify-center text-[var(--text-3)] text-[11px]">Empty</div>
                )}
              </div>
              <div className="p-3">
                <div className="text-[14px] font-semibold truncate">{b.title}</div>
                <div className="text-[11px] text-[var(--text-3)] mt-0.5">{b.items.length} item{b.items.length !== 1 ? 's' : ''}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ Watchlist helpers ═══ */
function loadWatchlist(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('lenzy-watchlist') || '[]'); } catch { return []; }
}
function saveWatchlist(handles: string[]) {
  localStorage.setItem('lenzy-watchlist', JSON.stringify(handles));
}

/* ═══ Watchlist — 24/7 brand tracking (Foreplay Spyder equivalent) ═══ */
function Watchlist({ onOpen }: { onOpen: (p: Post) => void }) {
  const router = useRouter();
  const [watched, setWatched] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableBrands, setAvailableBrands] = useState<Array<{ name: string; handle: string }>>([]);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { setWatched(loadWatchlist()); }, []);

  // Load the brand list for the picker
  useEffect(() => {
    fetch('/api/brands').then(r => r.json()).then(d => {
      setAvailableBrands(d.brands || []);
    }).catch(() => {});
  }, []);

  // Load latest posts from watched brands
  useEffect(() => {
    if (watched.length === 0) { setPosts([]); return; }
    setLoading(true);
    // Use the existing feed API and filter client-side
    fetch(`/api/feed?limit=500`).then(r => r.json()).then(d => {
      const set = new Set(watched.map(h => h.toLowerCase()));
      const filtered = ((d.posts || []) as Post[])
        .filter(p => set.has(p.brand.handle.toLowerCase()))
        .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
      setPosts(filtered);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [watched]);

  const toggle = (handle: string) => {
    const next = watched.includes(handle)
      ? watched.filter(h => h !== handle)
      : [...watched, handle];
    setWatched(next);
    saveWatchlist(next);
  };

  const sinceLastSeen = (p: Post): string => {
    const diff = Date.now() - new Date(p.postedAt).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const filteredBrands = availableBrands.filter(b =>
    !search.trim() || b.name.toLowerCase().includes(search.toLowerCase()) || b.handle.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Watchlist</h2>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5">Tracking {watched.length} brand{watched.length !== 1 ? 's' : ''} · {posts.length} post{posts.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setEditing(e => !e)} className="px-3 py-2 bg-[var(--bg-alt)] text-[var(--text)] text-[12px] font-semibold rounded-lg flex items-center gap-1.5">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* Brand picker */}
      {editing && (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search brands to track…"
            className="w-full bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none mb-2"
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredBrands.slice(0, 50).map(b => {
              const on = watched.includes(b.handle);
              return (
                <button
                  key={b.handle}
                  onClick={() => toggle(b.handle)}
                  className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-[var(--bg-alt)] text-left"
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold truncate">{b.name}</div>
                    <div className="text-[10px] text-[var(--text-3)]">@{b.handle}</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${on ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-alt)] border border-[var(--line)]'}`}>
                    {on && <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {watched.length === 0 && !editing && (
        <div className="text-center py-16 text-[var(--text-3)]">
          <svg width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="mx-auto mb-2 opacity-30"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          <p className="text-[13px]">Not tracking any brands yet</p>
          <p className="text-[11px] mt-1">Tap Edit to pick competitors to watch 24/7.</p>
        </div>
      )}

      {loading && watched.length > 0 && (
        <div className="flex items-center justify-center py-8 text-[var(--text-3)] text-[12px]">
          <div className="w-4 h-4 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin mr-2" />
          Loading posts…
        </div>
      )}

      {/* Grouped by brand */}
      {posts.length > 0 && (
        <div className="space-y-4">
          {Object.entries(
            posts.reduce((acc: Record<string, Post[]>, p) => {
              const key = p.brand.handle;
              if (!acc[key]) acc[key] = [];
              acc[key].push(p);
              return acc;
            }, {})
          ).map(([handle, brandPosts]) => (
            <div key={handle} className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
                <button onClick={() => router.push(`/brands/${handle}`)} className="text-left min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{brandPosts[0].brand.name}</div>
                  <div className="text-[10px] text-[var(--text-3)]">@{handle} · {brandPosts.length} post{brandPosts.length !== 1 ? 's' : ''}</div>
                </button>
                <div className="text-[10px] text-[var(--brand)] font-semibold uppercase tracking-wide">Latest {sinceLastSeen(brandPosts[0])}</div>
              </div>
              <div className="grid grid-cols-3 gap-[1px] bg-[var(--line)]">
                {brandPosts.slice(0, 6).map(p => (
                  <button key={p.id} onClick={() => onOpen(p)} className="relative aspect-square bg-[var(--bg)] overflow-hidden">
                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[9px] text-white font-semibold">{n(p.likes)} ♥</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ Brand Detail — per-brand deep dive page ═══ */
function BrandDetail({ handle, onOpen }: { handle: string; onOpen: (p: Post) => void }) {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [watched, setWatched] = useState<string[]>([]);

  useEffect(() => { setWatched(loadWatchlist()); }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/feed?limit=500`).then(r => r.json()).then(d => {
      const filtered = ((d.posts || []) as Post[]).filter(p => p.brand.handle.toLowerCase() === handle.toLowerCase());
      filtered.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
      setPosts(filtered);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [handle]);

  const stats = useMemo(() => {
    if (posts.length === 0) return null;
    const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
    const totalComments = posts.reduce((s, p) => s + p.comments, 0);
    const avgEng = posts.reduce((s, p) => s + p.engagement, 0) / posts.length;
    const videoCount = posts.filter(p => p.isVideo).length;
    const topPost = [...posts].sort((a, b) => b.likes - a.likes)[0];
    return { totalLikes, totalComments, avgEng, videoCount, postCount: posts.length, topPost };
  }, [posts]);

  const isWatched = watched.includes(handle);
  const toggleWatch = () => {
    const next = isWatched ? watched.filter(h => h !== handle) : [...watched, handle];
    setWatched(next);
    saveWatchlist(next);
  };

  const brandInfo = posts[0]?.brand;

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-[var(--text-3)] text-[12px]"><div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin mr-2" />Loading brand…</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="py-4">
        <button onClick={() => router.back()} className="text-[var(--text-2)] text-[12px] font-semibold mb-4">← Back</button>
        <div className="text-center py-16 text-[var(--text-3)]">
          <p className="text-[13px]">No posts found for @{handle}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <button onClick={() => router.back()} className="text-[var(--text-2)] p-1 flex-shrink-0">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[22px] font-bold tracking-tight">{brandInfo?.name || handle}</h2>
          <div className="text-[11px] text-[var(--text-3)] mt-0.5">@{handle} · {brandInfo?.category} · {brandInfo?.region}</div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <a href={`https://instagram.com/${handle}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-[var(--bg-alt)] rounded-lg text-[11px] font-semibold">IG</a>
          <button onClick={toggleWatch} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 ${isWatched ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-alt)] text-[var(--text)]'}`}>
            <svg width="12" height="12" fill={isWatched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
            {isWatched ? 'Watching' : 'Watch'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
            <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wider">Posts</div>
            <div className="text-[18px] font-bold">{stats.postCount}</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
            <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wider">Total likes</div>
            <div className="text-[18px] font-bold">{n(stats.totalLikes)}</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
            <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wider">Comments</div>
            <div className="text-[18px] font-bold">{n(stats.totalComments)}</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
            <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wider">Avg engagement</div>
            <div className="text-[18px] font-bold text-[var(--brand)]">{stats.avgEng.toFixed(1)}%</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
            <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wider">Videos</div>
            <div className="text-[18px] font-bold">{stats.videoCount}<span className="text-[11px] text-[var(--text-3)] font-normal"> / {stats.postCount}</span></div>
          </div>
        </div>
      )}

      {/* Post grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-[2px]">
        {posts.map(p => (
          <button key={p.id} onClick={() => onOpen(p)} className="relative aspect-square bg-[var(--bg-alt)] overflow-hidden">
            <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 flex justify-between text-[9px] text-white font-semibold">
              <span>{n(p.likes)} ♥</span>
              <span>{p.engagement}%</span>
            </div>
            {p.isVideo && <div className="absolute top-1 right-1"><svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══ Ad Library — Meta Graph API ads_archive (Spyder equivalent) ═══ */
interface MetaAd {
  id: string;
  page_name?: string;
  page_id?: string;
  ad_creative_body?: string;
  ad_creative_link_title?: string;
  ad_creative_link_description?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  currency?: string;
  impressions?: { lower_bound: string; upper_bound: string };
  spend?: { lower_bound: string; upper_bound: string };
  publisher_platforms?: string[];
}

function AdLibrary() {
  const [query, setQuery] = useState('Lenskart');
  const [country, setCountry] = useState('ALL');
  const [ads, setAds] = useState<MetaAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupSteps, setSetupSteps] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/ads?q=${encodeURIComponent(query)}&country=${country}&limit=40`);
      const data = await res.json();
      if (data.needsSetup) {
        setNeedsSetup(true);
        setSetupSteps(data.setupInstructions?.steps || []);
      } else if (data.error) {
        setErr(data.error);
      } else {
        setAds(data.ads || []);
        setNeedsSetup(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, [query, country]);

  useEffect(() => { load(); }, [load]);

  const formatRange = (r?: { lower_bound: string; upper_bound: string }) => {
    if (!r) return '—';
    const lo = Number(r.lower_bound || 0);
    const hi = Number(r.upper_bound || 0);
    if (hi === 0 && lo === 0) return '—';
    return `${n(lo)}–${n(hi)}`;
  };

  return (
    <div className="py-4">
      <div className="mb-4">
        <h2 className="text-[20px] font-bold tracking-tight">Ad Library</h2>
        <p className="text-[11px] text-[var(--text-3)] mt-0.5">Live Meta ads from eyewear competitors</p>
      </div>

      {/* Search */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 flex gap-2">
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search brand or keyword…"
          className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none"
          onKeyDown={e => { if (e.key === 'Enter') load(); }}
        />
        <select value={country} onChange={e => setCountry(e.target.value)} className="bg-[var(--bg-alt)] rounded-lg px-2 text-[11px] outline-none">
          <option value="ALL">🌐 Worldwide</option>
          <option value="IN">🇮🇳 India</option>
          <option value="US">🇺🇸 USA</option>
          <option value="GB">🇬🇧 UK</option>
          <option value="AE">🇦🇪 UAE</option>
          <option value="SG">🇸🇬 SG</option>
          <option value="AU">🇦🇺 AU</option>
          <option value="CA">🇨🇦 CA</option>
        </select>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50">
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {/* Setup screen */}
      {needsSetup && (
        <div className="bg-[var(--surface)] border border-[var(--brand)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-[var(--brand)]"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div className="text-[14px] font-semibold">Connect Meta Ad Library</div>
          </div>
          <p className="text-[12px] text-[var(--text-2)] leading-relaxed mb-3">
            Meta&apos;s Ad Library API is free but requires a one-time setup. Once connected, you&apos;ll see live paid ads from any eyewear brand in any country, with spend and impression ranges.
          </p>
          <ol className="space-y-2 text-[12px] text-[var(--text-2)] list-decimal list-inside">
            {setupSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">
            Open Meta Graph Explorer →
          </a>
        </div>
      )}

      {err && !needsSetup && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px]">{err}</div>
      )}

      {!needsSetup && !err && ads.length === 0 && !loading && (
        <div className="text-center py-16 text-[var(--text-3)]">
          <p className="text-[13px]">No ads found for &quot;{query}&quot;</p>
          <p className="text-[11px] mt-1">Try a different brand or country.</p>
        </div>
      )}

      {/* Ad grid */}
      {ads.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ads.map(ad => (
            <article key={ad.id} className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold truncate">{ad.page_name || '—'}</div>
                  <div className="text-[10px] text-[var(--text-3)]">Started {ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time).toLocaleDateString() : '—'}</div>
                </div>
                {ad.ad_delivery_stop_time ? (
                  <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-3)] bg-[var(--bg-alt)] px-1.5 py-0.5 rounded">Ended</span>
                ) : (
                  <span className="text-[9px] uppercase tracking-wider font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">Live</span>
                )}
              </div>

              {/* Creative iframe snapshot from Meta */}
              {ad.ad_snapshot_url && (
                <div className="aspect-[4/5] bg-[var(--bg-alt)] overflow-hidden">
                  <iframe src={ad.ad_snapshot_url} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" loading="lazy" />
                </div>
              )}

              <div className="p-4 space-y-2">
                {ad.ad_creative_link_title && <div className="text-[12px] font-semibold line-clamp-2">{ad.ad_creative_link_title}</div>}
                {ad.ad_creative_body && <p className="text-[11px] text-[var(--text-2)] line-clamp-3 leading-snug">{ad.ad_creative_body}</p>}

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--line)]">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[var(--text-3)] font-bold">Impressions</div>
                    <div className="text-[11px] font-semibold">{formatRange(ad.impressions)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[var(--text-3)] font-bold">Spend</div>
                    <div className="text-[11px] font-semibold">{ad.currency} {formatRange(ad.spend)}</div>
                  </div>
                </div>

                {ad.publisher_platforms && ad.publisher_platforms.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ad.publisher_platforms.map(p => (
                      <span key={p} className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-3)] bg-[var(--bg-alt)] px-1.5 py-0.5 rounded">{p}</span>
                    ))}
                  </div>
                )}

                {ad.ad_snapshot_url && (
                  <a href={ad.ad_snapshot_url} target="_blank" rel="noopener noreferrer" className="block text-center py-1.5 bg-[var(--bg-alt)] rounded text-[10px] font-semibold text-[var(--text-2)] mt-1">
                    Open on Meta →
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ News — Daily digest synthesized from internal Lenzy data ═══ */

interface NewsItem {
  headline: string;
  summary: string;
  source?: string;
  url?: string;
  metric?: string;
  thumbnail?: string;
}
interface NewsSection {
  title: string;
  emoji: string;
  items: NewsItem[];
}
interface NewsDigest {
  date: string;
  region: string;
  intro: string;
  sections: NewsSection[];
  dataSources: { name: string; count: number }[];
  generatedAt: string;
  cached: boolean;
}

function News() {
  const [digest, setDigest] = useState<NewsDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [region, setRegion] = useState('ALL');

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setErr('');
    try {
      const res = await fetch(`/api/news?region=${region}${refresh ? '&refresh=1' : ''}`);
      const data = await res.json();
      if (data.error) setErr(data.error);
      else setDigest(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, [region]);

  useEffect(() => { load(false); }, [load]);

  return (
    <div className="py-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-[var(--brand)] mb-1">Daily Digest</div>
          <h2 className="text-[26px] font-bold tracking-tight leading-tight">
            {digest ? new Date(digest.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : "Today's eyewear brief"}
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select value={region} onChange={e => setRegion(e.target.value)} className="bg-[var(--bg-alt)] rounded-lg px-2 py-1.5 text-[11px] outline-none">
            <option value="ALL">🌐 Global</option>
            <option value="North America">🇺🇸 NA</option>
            <option value="Europe">🇪🇺 EU</option>
            <option value="South Asia">🇮🇳 SA</option>
            <option value="Asia">🌏 Asia</option>
          </select>
          <button onClick={() => load(true)} disabled={loading} className="p-2 bg-[var(--bg-alt)] rounded-lg disabled:opacity-50" title="Refresh digest">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className={loading ? 'animate-spin' : ''}><path d="M23 4v6h-6M1 20v-6h6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          </button>
        </div>
      </div>

      {loading && !digest && (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[12px] text-[var(--text-3)] mt-3">Writing your morning brief from {FEED_STATS_PLACEHOLDER}k posts + 21k products…</p>
        </div>
      )}

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] mb-4">{err}</div>}

      {digest && (
        <>
          {/* Intro */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-5 mb-4">
            <p className="text-[14px] leading-relaxed text-[var(--text)]">{digest.intro}</p>
            <div className="flex items-center gap-2 mt-3 text-[10px] text-[var(--text-3)]">
              {digest.cached && <span className="inline-block px-1.5 py-0.5 bg-[var(--bg-alt)] rounded uppercase tracking-wider font-bold">Cached</span>}
              <span>Built from {digest.dataSources.map(s => `${s.count} ${s.name.toLowerCase()}`).join(' · ')}</span>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-5">
            {digest.sections.map((section, si) => (
              <section key={si}>
                <div className="flex items-baseline gap-2 mb-3 px-1">
                  <span className="text-[22px]">{section.emoji}</span>
                  <h3 className="text-[16px] font-bold tracking-tight">{section.title}</h3>
                </div>
                <div className="space-y-3">
                  {section.items.map((item, ii) => (
                    <a
                      key={ii}
                      href={item.url || '#'}
                      target={item.url ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className={`block bg-[var(--surface)] border border-[var(--line)] rounded-xl p-4 ${item.url ? 'hover:border-[var(--brand)] transition-colors' : 'cursor-default'}`}
                    >
                      <div className="flex gap-3">
                        {item.thumbnail && (
                          <img src={item.thumbnail} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0 bg-[var(--bg-alt)]" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold leading-snug">{item.headline}</div>
                          <p className="text-[12px] text-[var(--text-2)] leading-relaxed mt-1">{item.summary}</p>
                          <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--text-3)]">
                            {item.source && <span className="font-semibold">{item.source}</span>}
                            {item.metric && <><span>·</span><span className="text-[var(--brand)] font-semibold">{item.metric}</span></>}
                          </div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="text-center mt-8 text-[10px] text-[var(--text-3)]">
            Generated {new Date(digest.generatedAt).toLocaleTimeString()} · Auto-refreshes every 4 hours
          </div>
        </>
      )}
    </div>
  );
}

// Small placeholder — we don't have a precise count here, so the string is
// just used for the loading state copy.
const FEED_STATS_PLACEHOLDER = 1;

/* ═══ Celebrities — who's wearing what ═══ */

interface Celebrity {
  name: string;
  category: string;
  country: string;
  knownFor: string;
}
interface EyewearPost {
  id: string;
  imageUrl: string;
  postUrl: string;
  caption: string;
  likes: number;
  comments: number;
  postedAt: string;
  eyewearType: string;
}
interface CelebIgResult {
  name: string;
  handle: string;
  totalPostsScanned: number;
  eyewearPostsCount: number;
  eyewearPosts: EyewearPost[];
  fetchedAt: string;
  cached: boolean;
  needsSetup?: boolean;
  needsHandle?: boolean;
  error?: string;
  hint?: string;
  setupInstructions?: { title: string; steps: string[]; why?: string };
}

function Celebrities() {
  const [list, setList] = useState<Celebrity[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('All');
  const [q, setQ] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Celebrity | null>(null);
  const [result, setResult] = useState<CelebIgResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [handleOverride, setHandleOverride] = useState('');

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '500' });
    if (category !== 'All') p.set('category', category);
    if (q.trim()) p.set('q', q.trim());
    fetch(`/api/celebrities?${p}`).then(r => r.json()).then(d => {
      setList(d.celebrities || []);
      setCategories(['All', ...(d.categories || [])]);
      setTotal(d.total || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [category, q]);

  const scanCeleb = async (c: Celebrity, overrideHandle?: string) => {
    setScanning(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ name: c.name, limit: '20' });
      if (overrideHandle) params.set('handle', overrideHandle);
      const res = await fetch(`/api/celebrities/instagram?${params}`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({
        name: c.name,
        handle: '',
        totalPostsScanned: 0,
        eyewearPostsCount: 0,
        eyewearPosts: [],
        fetchedAt: new Date().toISOString(),
        cached: false,
        error: e instanceof Error ? e.message : 'Scan failed',
      });
    }
    setScanning(false);
  };

  const openCeleb = (c: Celebrity) => {
    setSelected(c);
    setHandleOverride('');
    scanCeleb(c);
  };

  return (
    <div className="py-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Celebrities</h2>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5">{total} curated celebrities — tap any to see their eyewear moments</p>
        </div>
      </div>

      {/* Search + category chips */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 space-y-2">
        <input
          type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search celebrities or known frames…"
          className="w-full bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none"
        />
        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap flex-shrink-0 ${category === c ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-16 text-[var(--text-3)] text-[12px]"><div className="w-4 h-4 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin mr-2" />Loading celebs…</div>}

      {!loading && list.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map(c => (
            <button
              key={c.name}
              onClick={() => openCeleb(c)}
              className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-4 text-left hover:border-[var(--brand)] transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--brand)] to-purple-500 flex items-center justify-center text-white text-[16px] font-bold mb-2">
                {c.name.charAt(0)}
              </div>
              <div className="text-[13px] font-semibold line-clamp-1">{c.name}</div>
              <div className="text-[10px] text-[var(--text-3)] mt-0.5">{c.category} · {c.country}</div>
              <p className="text-[11px] text-[var(--text-2)] line-clamp-2 mt-1.5 leading-snug">{c.knownFor}</p>
            </button>
          ))}
        </div>
      )}

      {/* Celebrity Instagram eyewear scanner modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
          <div className="bg-[var(--surface)] max-w-4xl w-full max-h-[85vh] rounded-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 border-b border-[var(--line)] flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[18px] font-bold truncate">{selected.name}</div>
                  {result?.handle && <span className="text-[11px] text-[var(--brand)] font-semibold">@{result.handle}</span>}
                </div>
                <div className="text-[11px] text-[var(--text-3)]">{selected.category} · {selected.country}</div>
                <p className="text-[12px] text-[var(--text-2)] mt-2 leading-relaxed max-w-md">{selected.knownFor}</p>
                {result && !result.error && !result.needsSetup && !result.needsHandle && (
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--text-3)]">
                    <span className="font-semibold text-[var(--brand)]">{result.eyewearPostsCount} eyewear</span>
                    <span>· scanned {result.totalPostsScanned} posts</span>
                    {result.cached && <span className="px-1.5 py-0.5 bg-[var(--bg-alt)] rounded uppercase tracking-wider font-bold">Cached</span>}
                  </div>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-[var(--text-3)] text-[22px] leading-none px-2 flex-shrink-0">×</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {scanning && (
                <div className="text-center py-12">
                  <div className="inline-block w-6 h-6 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
                  <p className="text-[12px] text-[var(--text-3)] mt-3">Scraping @{result?.handle || selected.name}&apos;s Instagram…</p>
                  <p className="text-[10px] text-[var(--text-3)] mt-1">Running Gemini Vision on each post to detect eyewear</p>
                </div>
              )}

              {/* Needs Apify setup */}
              {!scanning && result?.needsSetup && (
                <div className="bg-[var(--bg-alt)] border border-[var(--brand)] rounded-xl p-4">
                  <div className="text-[14px] font-semibold mb-2">Connect Apify to scan Instagrams</div>
                  <p className="text-[11px] text-[var(--text-2)] leading-relaxed mb-3">{result.setupInstructions?.why}</p>
                  <ol className="space-y-1.5 text-[11px] text-[var(--text-2)] list-decimal list-inside">
                    {(result.setupInstructions?.steps || []).map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">Open Apify →</a>
                </div>
              )}

              {/* Needs handle override */}
              {!scanning && result?.needsHandle && (
                <div className="bg-[var(--bg-alt)] border border-[var(--line)] rounded-xl p-4">
                  <div className="text-[13px] font-semibold mb-2">No Instagram handle on file</div>
                  <p className="text-[11px] text-[var(--text-2)] leading-relaxed mb-3">{result.error}</p>
                  <div className="flex gap-2">
                    <input
                      type="text" value={handleOverride} onChange={e => setHandleOverride(e.target.value)}
                      placeholder="e.g. badgalriri"
                      className="flex-1 min-w-0 bg-[var(--surface)] rounded-lg px-3 py-2 text-[12px] outline-none"
                      onKeyDown={e => { if (e.key === 'Enter' && handleOverride.trim() && selected) scanCeleb(selected, handleOverride.trim()); }}
                    />
                    <button
                      onClick={() => { if (handleOverride.trim() && selected) scanCeleb(selected, handleOverride.trim()); }}
                      disabled={!handleOverride.trim()}
                      className="px-4 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg disabled:opacity-40"
                    >Scan</button>
                  </div>
                </div>
              )}

              {/* Error */}
              {!scanning && result?.error && !result.needsSetup && !result.needsHandle && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px]">
                  {result.error}
                  {result.hint && <div className="text-[11px] mt-1 opacity-80">{result.hint}</div>}
                </div>
              )}

              {/* No eyewear posts */}
              {!scanning && result && !result.error && result.eyewearPosts.length === 0 && (
                <div className="text-center py-12 text-[var(--text-3)] text-[12px]">
                  <p>No eyewear posts found in the last {result.totalPostsScanned} posts.</p>
                  <button onClick={() => selected && scanCeleb(selected, handleOverride || undefined)} className="mt-3 text-[11px] text-[var(--brand)] font-semibold">↻ Refresh scan</button>
                </div>
              )}

              {/* Eyewear posts grid */}
              {!scanning && result && result.eyewearPosts.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {result.eyewearPosts.map(post => (
                    <a key={post.id} href={post.postUrl} target="_blank" rel="noopener noreferrer" className="bg-[var(--bg-alt)] border border-[var(--line)] rounded-xl overflow-hidden hover:border-[var(--brand)] transition-colors">
                      <div className="aspect-square bg-black">
                        <img
                          src={`/api/img?url=${encodeURIComponent(post.imageUrl)}`}
                          alt={post.eyewearType}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                      <div className="p-2.5">
                        <div className="text-[10px] font-semibold text-[var(--brand)] uppercase tracking-wide line-clamp-1">👓 {post.eyewearType}</div>
                        {post.caption && <p className="text-[10px] text-[var(--text-2)] line-clamp-2 mt-1 leading-snug">{post.caption}</p>}
                        <div className="flex gap-2 mt-1.5 text-[9px] text-[var(--text-3)]">
                          <span>♥ {n(post.likes)}</span>
                          <span>💬 {n(post.comments)}</span>
                          {post.postedAt && <span>· {new Date(post.postedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ Sources — Unified intelligence hub (Shopify + Trends + Reddit + Google Ads) ═══ */

type SourceTab = 'shopify' | 'trends' | 'reddit' | 'google-ads' | 'youtube' | 'brave' | 'tiktok' | 'amazon' | 'linkedin';

interface ShopifyStore { handle: string; domain: string; name: string }
interface ShopifyProd { id: number; title: string; image: string; price: string; comparePrice: string | null; available: boolean; createdAt: string; url: string; variantCount: number; soldOut: boolean }
interface ShopifyStats { totalProducts: number; totalActive: number; totalVariants: number; avgPrice: number; minPrice: number; maxPrice: number; newThisWeek: number; topTypes: Array<{ name: string; count: number }>; topTags: Array<{ name: string; count: number }> }

function Sources() {
  const [sub, setSub] = useState<SourceTab>('shopify');

  return (
    <div className="py-4">
      <div className="mb-4">
        <h2 className="text-[20px] font-bold tracking-tight">Intelligence Sources</h2>
        <p className="text-[11px] text-[var(--text-3)] mt-0.5">Live data from every corner of the eyewear market</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {[
          { k: 'shopify', l: 'Shopify', icon: '🛍️' },
          { k: 'amazon', l: 'Amazon', icon: '📦' },
          { k: 'trends', l: 'Trends', icon: '📈' },
          { k: 'reddit', l: 'Reddit', icon: '💬' },
          { k: 'youtube', l: 'YouTube', icon: '📺' },
          { k: 'tiktok', l: 'TikTok', icon: '🎵' },
          { k: 'linkedin', l: 'LinkedIn', icon: '💼' },
          { k: 'brave', l: 'Web', icon: '🔍' },
          { k: 'google-ads', l: 'Google Ads', icon: '🎯' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setSub(t.k as SourceTab)}
            className={`px-3 py-2 rounded-lg text-[12px] font-semibold whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${sub === t.k ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}
          >
            <span>{t.icon}</span>{t.l}
          </button>
        ))}
      </div>

      {sub === 'shopify' && <ShopifySource />}
      {sub === 'amazon' && <AmazonSource />}
      {sub === 'trends' && <TrendsSource />}
      {sub === 'reddit' && <RedditSource />}
      {sub === 'youtube' && <YouTubeSource />}
      {sub === 'tiktok' && <TikTokSource />}
      {sub === 'linkedin' && <LinkedInSource />}
      {sub === 'brave' && <BraveSource />}
      {sub === 'google-ads' && <GoogleAdsSource />}
    </div>
  );
}

/* ── Shopify storefront scraper ── */
function ShopifySource() {
  const [stores, setStores] = useState<ShopifyStore[]>([]);
  const [store, setStore] = useState<string>('warbyparker.com');
  const [customStore, setCustomStore] = useState('');
  const [products, setProducts] = useState<ShopifyProd[]>([]);
  const [stats, setStats] = useState<ShopifyStats | null>(null);
  const [recent, setRecent] = useState<ShopifyProd[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/shopify?list=1').then(r => r.json()).then(d => setStores(d.stores || []));
  }, []);

  const load = useCallback(async (targetDomain: string) => {
    if (!targetDomain) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/shopify?store=${encodeURIComponent(targetDomain)}&limit=50`);
      const data = await res.json();
      if (data.error) {
        setErr(data.error);
        setProducts([]);
        setStats(null);
        setRecent([]);
      } else {
        setProducts(data.products || []);
        setStats(data.stats || null);
        setRecent(data.recentlyAdded || []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(store); }, [store, load]);

  return (
    <div>
      {/* Store picker */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4">
        <div className="flex gap-2 mb-2">
          <input
            type="text" value={customStore} onChange={e => setCustomStore(e.target.value)}
            placeholder="Enter any Shopify store domain…"
            className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none"
            onKeyDown={e => { if (e.key === 'Enter' && customStore.trim()) { setStore(customStore.trim()); setCustomStore(''); } }}
          />
          <button
            onClick={() => { if (customStore.trim()) { setStore(customStore.trim()); setCustomStore(''); } }}
            className="px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg"
          >
            Scan
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {stores.map(s => (
            <button
              key={s.handle}
              onClick={() => setStore(s.domain)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap flex-shrink-0 ${store === s.domain ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-12 text-[var(--text-3)] text-[12px]"><div className="w-4 h-4 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin mr-2" />Scanning {store}…</div>}

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] mb-4">{err}</div>}

      {stats && !loading && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            <StatTile label="Products" value={String(stats.totalProducts)} />
            <StatTile label="Active" value={String(stats.totalActive)} />
            <StatTile label="Variants" value={String(stats.totalVariants)} />
            <StatTile label="Avg price" value={`$${stats.avgPrice}`} accent />
            <StatTile label="New this week" value={String(stats.newThisWeek)} accent={stats.newThisWeek > 0} />
          </div>

          {/* New this week */}
          {recent.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--brand)] mb-2">🔥 New this week</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {recent.map(p => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="bg-[var(--surface)] border border-[var(--brand)] rounded-xl overflow-hidden">
                    <div className="aspect-square bg-white"><img src={p.image} alt={p.title} className="w-full h-full object-contain p-2" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
                    <div className="p-2">
                      <div className="text-[11px] font-semibold line-clamp-1">{p.title}</div>
                      <div className="text-[11px] text-[var(--brand)] font-bold">${p.price}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Top tags */}
          {stats.topTags.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-3)] mb-2">Top tags</div>
              <div className="flex flex-wrap gap-1.5">
                {stats.topTags.map(t => (
                  <span key={t.name} className="text-[11px] px-2 py-1 bg-[var(--bg-alt)] rounded-full">{t.name} <span className="text-[var(--text-3)]">{t.count}</span></span>
                ))}
              </div>
            </div>
          )}

          {/* Product grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map(p => (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
                <div className="aspect-square bg-white relative">
                  <img src={p.image} alt={p.title} className="w-full h-full object-contain p-3" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  {p.soldOut && <div className="absolute top-2 left-2 bg-black/80 text-white text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded">Sold out</div>}
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] font-semibold line-clamp-2 leading-snug">{p.title}</div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-[13px] font-bold">${p.price}</span>
                    {p.comparePrice && Number(p.comparePrice) > 0 && <span className="text-[10px] text-[var(--text-3)] line-through">${p.comparePrice}</span>}
                  </div>
                  <div className="text-[9px] text-[var(--text-3)] mt-0.5">{p.variantCount} variant{p.variantCount !== 1 ? 's' : ''}</div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
      <div className="text-[9px] uppercase tracking-wider text-[var(--text-3)] font-bold">{label}</div>
      <div className={`text-[16px] font-bold ${accent ? 'text-[var(--brand)]' : ''}`}>{value}</div>
    </div>
  );
}

/* ── Google Trends ── */
function TrendsSource() {
  const [q, setQ] = useState('sunglasses,eyeglasses,ray-ban');
  const [geo, setGeo] = useState(''); // empty = Worldwide
  const [timeframe, setTimeframe] = useState('today 3-m');
  const [data, setData] = useState<{ relatedQueries?: unknown; relatedTopics?: unknown; timeline?: unknown; error?: string; hint?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trends?q=${encodeURIComponent(q)}&geo=${geo}&timeframe=${encodeURIComponent(timeframe)}`);
      setData(await res.json());
    } catch (e) {
      setData({ error: e instanceof Error ? e.message : 'Fetch failed' });
    }
    setLoading(false);
  }, [q, geo, timeframe]);

  useEffect(() => { load(); }, [load]);

  // Related queries structure varies — extract rising + top
  const extractRanked = (widget: unknown): Array<{ query: string; value: number | string }> => {
    try {
      const w = widget as { default?: { rankedList?: Array<{ rankedKeyword?: Array<{ query?: string; topic?: { title: string }; value?: number; formattedValue?: string }> }> } };
      const list = w?.default?.rankedList?.[0]?.rankedKeyword || [];
      return list.slice(0, 20).map(k => ({ query: k.query || k.topic?.title || '?', value: k.formattedValue || k.value || '' }));
    } catch { return []; }
  };

  const top = data ? extractRanked(data.relatedQueries) : [];
  const topics = data ? extractRanked(data.relatedTopics) : [];

  return (
    <div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 space-y-2">
        <input
          type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder="comma-separated terms — e.g. ray-ban,oakley,lenskart"
          className="w-full bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none"
          onKeyDown={e => { if (e.key === 'Enter') load(); }}
        />
        <div className="flex gap-2">
          <select value={geo} onChange={e => setGeo(e.target.value)} className="bg-[var(--bg-alt)] rounded-lg px-2 py-2 text-[11px] outline-none">
            <option value="">Worldwide</option>
            <option value="IN">🇮🇳 India</option>
            <option value="US">🇺🇸 USA</option>
            <option value="GB">🇬🇧 UK</option>
            <option value="AE">🇦🇪 UAE</option>
            <option value="SG">🇸🇬 SG</option>
            <option value="AU">🇦🇺 AU</option>
            <option value="CA">🇨🇦 CA</option>
          </select>
          <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="bg-[var(--bg-alt)] rounded-lg px-2 py-2 text-[11px] outline-none flex-1">
            <option value="now 1-d">Past 24h</option>
            <option value="now 7-d">Past 7 days</option>
            <option value="today 1-m">Past month</option>
            <option value="today 3-m">Past 3 months</option>
            <option value="today 12-m">Past year</option>
            <option value="today 5-y">Past 5 years</option>
          </select>
          <button onClick={load} disabled={loading} className="px-4 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50">{loading ? '…' : 'Search'}</button>
        </div>
      </div>

      {data?.error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] mb-4">{data.error}{data.hint && ` — ${data.hint}`}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Related queries */}
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--brand)] mb-2">🔥 Related queries</div>
          {top.length === 0 ? (
            <div className="text-[11px] text-[var(--text-3)]">No data</div>
          ) : (
            <div className="space-y-1.5">
              {top.map((k, i) => (
                <div key={i} className="flex items-center justify-between text-[12px]">
                  <span className="truncate">{k.query}</span>
                  <span className="text-[var(--text-3)] flex-shrink-0 ml-2">{String(k.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Related topics */}
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--brand)] mb-2">📈 Related topics</div>
          {topics.length === 0 ? (
            <div className="text-[11px] text-[var(--text-3)]">No data</div>
          ) : (
            <div className="space-y-1.5">
              {topics.map((k, i) => (
                <div key={i} className="flex items-center justify-between text-[12px]">
                  <span className="truncate">{k.query}</span>
                  <span className="text-[var(--text-3)] flex-shrink-0 ml-2">{String(k.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Reddit mentions ── */
interface RedditResultPost { id: string; title: string; snippet: string; subreddit: string; author: string; score: number; upvoteRatio: number; comments: number; createdAt: string; permalink: string; thumbnail: string }
function RedditSource() {
  const [q, setQ] = useState('lenskart');
  const [sub, setSub] = useState('');
  const [sort, setSort] = useState('relevance');
  const [time, setTime] = useState('month');
  const [posts, setPosts] = useState<RedditResultPost[]>([]);
  const [stats, setStats] = useState<{ totalScore: number; totalComments: number; avgUpvoteRatio: number; subBreakdown: Array<{ name: string; count: number }> } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ q, sort, time, limit: '30' });
      if (sub) p.set('sub', sub);
      const res = await fetch(`/api/reddit?${p}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setStats(data.stats || null);
    } catch {}
    setLoading(false);
  }, [q, sub, sort, time]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 space-y-2">
        <div className="flex gap-2">
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Brand or topic" className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none" onKeyDown={e => { if (e.key === 'Enter') load(); }} />
          <input type="text" value={sub} onChange={e => setSub(e.target.value)} placeholder="subreddit (opt)" className="w-32 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none" />
          <button onClick={load} disabled={loading} className="px-4 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50">{loading ? '…' : 'Search'}</button>
        </div>
        <div className="flex gap-2">
          <select value={sort} onChange={e => setSort(e.target.value)} className="flex-1 bg-[var(--bg-alt)] rounded-lg px-2 py-1.5 text-[11px] outline-none">
            <option value="relevance">Relevance</option>
            <option value="hot">Hot</option>
            <option value="top">Top</option>
            <option value="new">New</option>
            <option value="comments">Most comments</option>
          </select>
          <select value={time} onChange={e => setTime(e.target.value)} className="flex-1 bg-[var(--bg-alt)] rounded-lg px-2 py-1.5 text-[11px] outline-none">
            <option value="day">24h</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatTile label="Total upvotes" value={n(stats.totalScore)} accent />
          <StatTile label="Comments" value={n(stats.totalComments)} />
          <StatTile label="Upvote ratio" value={`${Math.round(stats.avgUpvoteRatio * 100)}%`} />
        </div>
      )}

      {stats && stats.subBreakdown.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-3)] mb-2">Posts by subreddit</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.subBreakdown.map(s => (
              <span key={s.name} className="text-[11px] px-2 py-1 bg-[var(--bg-alt)] rounded-full">r/{s.name} <span className="text-[var(--brand)] font-semibold">{s.count}</span></span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {posts.map(p => (
          <a key={p.id} href={p.permalink} target="_blank" rel="noopener noreferrer" className="block bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 hover:border-[var(--brand)]">
            <div className="flex gap-3">
              {p.thumbnail && <img src={p.thumbnail} alt="" className="w-16 h-16 rounded object-cover flex-shrink-0 bg-[var(--bg-alt)]" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 text-[10px] text-[var(--text-3)]">
                  <span className="font-semibold">r/{p.subreddit}</span>
                  <span>·</span>
                  <span>u/{p.author}</span>
                  <span>·</span>
                  <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="text-[12px] font-semibold line-clamp-2">{p.title}</div>
                {p.snippet && <p className="text-[11px] text-[var(--text-2)] line-clamp-2 mt-1">{p.snippet}</p>}
                <div className="flex gap-3 mt-1.5 text-[11px] text-[var(--text-3)]">
                  <span>↑ {n(p.score)}</span>
                  <span>💬 {n(p.comments)}</span>
                  <span>{Math.round(p.upvoteRatio * 100)}% upvoted</span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── Google Ads Transparency ── */
/* ── Amazon (via Apify) ── */
interface AmazonProduct { asin?: string; title?: string; url?: string; image?: string; price?: number | string; currency?: string; rating?: number; reviews?: number; prime?: boolean; sponsored?: boolean; brand?: string }

function AmazonSource() {
  const [q, setQ] = useState('sunglasses');
  const [country, setCountry] = useState('com');
  const [products, setProducts] = useState<AmazonProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupSteps, setSetupSteps] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!q.trim()) return;
    setLoading(true); setErr(''); setProducts([]);
    try {
      const res = await fetch(`/api/amazon?q=${encodeURIComponent(q)}&country=${country}&limit=30`);
      const data = await res.json();
      if (data.needsSetup) {
        setNeedsSetup(true);
        setSetupSteps(data.setupInstructions?.steps || []);
      } else if (data.error) {
        setErr(data.error);
      } else {
        setNeedsSetup(false);
        setProducts(data.products || []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, [q, country]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 flex gap-2">
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Product or keyword…" className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none" onKeyDown={e => { if (e.key === 'Enter') load(); }} />
        <select value={country} onChange={e => setCountry(e.target.value)} className="bg-[var(--bg-alt)] rounded-lg px-2 py-2 text-[11px] outline-none">
          <option value="com">🇺🇸 .com</option>
          <option value="in">🇮🇳 .in</option>
          <option value="co.uk">🇬🇧 .co.uk</option>
          <option value="ca">🇨🇦 .ca</option>
          <option value="com.au">🇦🇺 .com.au</option>
          <option value="de">🇩🇪 .de</option>
          <option value="fr">🇫🇷 .fr</option>
        </select>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50">{loading ? '…' : 'Search'}</button>
      </div>

      {needsSetup && (
        <div className="bg-[var(--surface)] border border-[var(--brand)] rounded-xl p-4 mb-4">
          <div className="text-[14px] font-semibold mb-2">Apify required for Amazon intelligence</div>
          <p className="text-[11px] text-[var(--text-2)] leading-relaxed mb-2">Amazon blocks direct scraping — we use the Apify junglee/Amazon-crawler actor which costs ~$0.75 / 1000 products.</p>
          <ol className="space-y-2 text-[12px] text-[var(--text-2)] list-decimal list-inside">
            {setupSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">Open Apify Console →</a>
        </div>
      )}

      {err && !needsSetup && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] mb-4">{err}</div>}

      {products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p, i) => (
            <a key={p.asin || i} href={p.url || '#'} target="_blank" rel="noopener noreferrer" className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
              <div className="aspect-square bg-white relative">
                {p.image && <img src={p.image} alt={p.title} className="w-full h-full object-contain p-3" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                {p.prime && <div className="absolute top-2 right-2 bg-blue-500 text-white text-[9px] uppercase font-bold px-1.5 py-0.5 rounded">Prime</div>}
                {p.sponsored && <div className="absolute top-2 left-2 bg-yellow-500/90 text-black text-[9px] uppercase font-bold px-1.5 py-0.5 rounded">Sponsored</div>}
              </div>
              <div className="p-3">
                {p.brand && <div className="text-[10px] text-[var(--text-3)] font-semibold truncate">{p.brand}</div>}
                <div className="text-[11px] font-semibold line-clamp-2 leading-snug">{p.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[13px] font-bold">{p.currency || '$'}{typeof p.price === 'number' ? p.price.toFixed(2) : p.price || '—'}</span>
                </div>
                {p.rating !== undefined && (
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-[var(--text-3)]">
                    <span className="text-yellow-500">★</span>
                    <span>{p.rating.toFixed(1)}</span>
                    {p.reviews !== undefined && <span>({n(p.reviews)})</span>}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── LinkedIn (via Apify) ── */
interface LIJob { id?: string; title?: string; company?: string; location?: string; url?: string; postedAt?: string; salary?: string; employmentType?: string; seniorityLevel?: string; description?: string; applicants?: number }
interface LICompany { name?: string; tagline?: string; description?: string; website?: string; industry?: string; size?: number | string; headquarters?: string; founded?: number; specialties?: string[]; logo?: string; followers?: number; url?: string }

function LinkedInSource() {
  const [mode, setMode] = useState<'jobs' | 'company'>('jobs');
  const [q, setQ] = useState('eyewear designer');
  const [location, setLocation] = useState('Worldwide');
  const [companySlug, setCompanySlug] = useState('lenskart');
  const [jobs, setJobs] = useState<LIJob[]>([]);
  const [company, setCompany] = useState<LICompany | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupSteps, setSetupSteps] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setErr(''); setJobs([]); setCompany(null);
    try {
      const url = mode === 'jobs'
        ? `/api/linkedin?mode=jobs&q=${encodeURIComponent(q)}&location=${encodeURIComponent(location)}&limit=25`
        : `/api/linkedin?mode=company&company=${encodeURIComponent(companySlug)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.needsSetup) {
        setNeedsSetup(true);
        setSetupSteps(data.setupInstructions?.steps || []);
      } else if (data.error) {
        setErr(data.error);
      } else {
        setNeedsSetup(false);
        if (mode === 'jobs') setJobs(data.jobs || []);
        else setCompany(data.company);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, [mode, q, location, companySlug]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 space-y-2">
        <div className="flex gap-2">
          <select value={mode} onChange={e => setMode(e.target.value as 'jobs' | 'company')} className="bg-[var(--bg-alt)] rounded-lg px-2 py-2 text-[11px] outline-none">
            <option value="jobs">Jobs</option>
            <option value="company">Company</option>
          </select>
          {mode === 'jobs' ? (
            <>
              <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Job title…" className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none" onKeyDown={e => { if (e.key === 'Enter') load(); }} />
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" className="w-28 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none" onKeyDown={e => { if (e.key === 'Enter') load(); }} />
            </>
          ) : (
            <input type="text" value={companySlug} onChange={e => setCompanySlug(e.target.value)} placeholder="company slug (e.g. lenskart)" className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none" onKeyDown={e => { if (e.key === 'Enter') load(); }} />
          )}
          <button onClick={load} disabled={loading} className="px-4 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50">{loading ? '…' : 'Search'}</button>
        </div>
      </div>

      {needsSetup && (
        <div className="bg-[var(--surface)] border border-[var(--brand)] rounded-xl p-4 mb-4">
          <div className="text-[14px] font-semibold mb-2">Apify required for LinkedIn intelligence</div>
          <p className="text-[11px] text-[var(--text-2)] leading-relaxed mb-2">LinkedIn actively blocks scrapers — Apify runs distributed browser sessions that work reliably. Costs ~$1 / 1000 results.</p>
          <ol className="space-y-2 text-[12px] text-[var(--text-2)] list-decimal list-inside">
            {setupSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">Open Apify Console →</a>
        </div>
      )}

      {err && !needsSetup && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] mb-4">{err}</div>}

      {mode === 'jobs' && jobs.length > 0 && (
        <div className="space-y-2">
          {jobs.map((j, i) => (
            <a key={j.id || i} href={j.url || '#'} target="_blank" rel="noopener noreferrer" className="block bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 hover:border-[var(--brand)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold line-clamp-1">{j.title}</div>
                  <div className="text-[11px] text-[var(--text-2)] mt-0.5">{j.company} · {j.location}</div>
                  {j.description && <p className="text-[11px] text-[var(--text-3)] line-clamp-2 mt-1.5 leading-snug">{j.description}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {j.employmentType && <span className="text-[9px] px-1.5 py-0.5 bg-[var(--bg-alt)] rounded">{j.employmentType}</span>}
                    {j.seniorityLevel && <span className="text-[9px] px-1.5 py-0.5 bg-[var(--bg-alt)] rounded">{j.seniorityLevel}</span>}
                    {j.salary && <span className="text-[9px] px-1.5 py-0.5 bg-[var(--brand)]/10 text-[var(--brand)] rounded font-semibold">{j.salary}</span>}
                  </div>
                </div>
                {j.postedAt && <span className="text-[9px] text-[var(--text-3)] flex-shrink-0">{j.postedAt}</span>}
              </div>
            </a>
          ))}
        </div>
      )}

      {mode === 'company' && company && (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5">
          <div className="flex items-start gap-4">
            {company.logo && <img src={company.logo} alt={company.name} className="w-16 h-16 rounded object-contain bg-white flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <h3 className="text-[18px] font-bold">{company.name}</h3>
              {company.tagline && <p className="text-[12px] text-[var(--text-2)] mt-0.5">{company.tagline}</p>}
              <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-[var(--text-3)]">
                {company.industry && <span>{company.industry}</span>}
                {company.headquarters && <span>· {company.headquarters}</span>}
                {company.founded && <span>· Founded {company.founded}</span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
            {company.size !== undefined && <StatTile label="Employees" value={typeof company.size === 'number' ? n(company.size) : String(company.size)} />}
            {company.followers !== undefined && <StatTile label="Followers" value={n(company.followers)} accent />}
            {company.website && <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3"><div className="text-[9px] uppercase tracking-wider text-[var(--text-3)] font-bold">Website</div><a href={company.website} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[var(--brand)] truncate block">{company.website.replace(/^https?:\/\//, '')}</a></div>}
          </div>
          {company.description && <p className="text-[11px] text-[var(--text-2)] leading-relaxed mt-4">{company.description}</p>}
          {company.specialties && company.specialties.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {company.specialties.map(s => <span key={s} className="text-[10px] px-2 py-0.5 bg-[var(--bg-alt)] rounded-full">{s}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoogleAdsSource() {
  const [advertiser, setAdvertiser] = useState('Lenskart');
  const [region, setRegion] = useState('IN');
  const [data, setData] = useState<{ advertiserId?: string; advertiserName?: string; profileUrl?: string; note?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!advertiser.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/google-ads?advertiser=${encodeURIComponent(advertiser)}&region=${region}`);
      setData(await res.json());
    } catch (e) {
      setData({ error: e instanceof Error ? e.message : 'Fetch failed' });
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 flex gap-2">
        <input type="text" value={advertiser} onChange={e => setAdvertiser(e.target.value)} placeholder="Advertiser name" className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none" onKeyDown={e => { if (e.key === 'Enter') load(); }} />
        <select value={region} onChange={e => setRegion(e.target.value)} className="bg-[var(--bg-alt)] rounded-lg px-2 text-[11px] outline-none">
          <option value="IN">🇮🇳</option><option value="US">🇺🇸</option><option value="GB">🇬🇧</option><option value="AE">🇦🇪</option>
        </select>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50">{loading ? '…' : 'Find'}</button>
      </div>

      {data?.error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] mb-4">{data.error}</div>}

      {data && !data.error && (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-4">
          {data.advertiserId ? (
            <>
              <div className="text-[13px] font-semibold">{data.advertiserName}</div>
              <div className="text-[11px] text-[var(--text-3)] mt-0.5">Advertiser ID: {data.advertiserId}</div>
              <a href={data.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">
                View all ads on Google →
              </a>
            </>
          ) : (
            <div className="text-[12px] text-[var(--text-2)]">{data.note || 'No advertiser found.'}</div>
          )}
          <p className="text-[10px] text-[var(--text-3)] mt-3 leading-relaxed">
            Google Ads Transparency Center is a JavaScript-heavy SPA — full ad creatives require deeper protobuf parsing of their batchexecute RPC. For now we surface the advertiser profile page which opens directly in Google&apos;s UI with every ad they&apos;re running.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── YouTube ── */
interface YTVideo { id: string; title: string; channelTitle?: string; channelId?: string; thumbnail: string; publishedAt: string; views: number; likes: number; comments: number; url: string }
interface YTChannel { id: string; title: string; thumbnail: string; subscribers: number; videoCount: number; viewCount: number; url: string; country?: string }

function YouTubeSource() {
  const [q, setQ] = useState('lenskart');
  const [mode, setMode] = useState<'video' | 'channel'>('video');
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [channels, setChannels] = useState<YTChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupSteps, setSetupSteps] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!q.trim()) return;
    setLoading(true); setErr(''); setVideos([]); setChannels([]);
    try {
      const res = await fetch(`/api/youtube?q=${encodeURIComponent(q)}&type=${mode}&limit=20`);
      const data = await res.json();
      if (data.needsSetup) {
        setNeedsSetup(true);
        setSetupSteps(data.setupInstructions?.steps || []);
      } else if (data.error) {
        setErr(data.error);
      } else {
        setNeedsSetup(false);
        if (mode === 'channel') setChannels(data.channels || []);
        else setVideos(data.videos || []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, [q, mode]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 flex gap-2">
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Brand or topic…" className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none" onKeyDown={e => { if (e.key === 'Enter') load(); }} />
        <select value={mode} onChange={e => setMode(e.target.value as 'video' | 'channel')} className="bg-[var(--bg-alt)] rounded-lg px-2 py-2 text-[11px] outline-none">
          <option value="video">Videos</option>
          <option value="channel">Channels</option>
        </select>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50">{loading ? '…' : 'Search'}</button>
      </div>

      {needsSetup && (
        <div className="bg-[var(--surface)] border border-[var(--brand)] rounded-xl p-4 mb-4">
          <div className="text-[14px] font-semibold mb-2">Connect YouTube Data API</div>
          <ol className="space-y-2 text-[12px] text-[var(--text-2)] list-decimal list-inside">
            {setupSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">Open Google Cloud Console →</a>
        </div>
      )}

      {err && !needsSetup && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] mb-4">{err}</div>}

      {mode === 'video' && videos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {videos.map(v => (
            <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
              <div className="aspect-video bg-[var(--bg-alt)]"><img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
              <div className="p-3">
                <div className="text-[11px] text-[var(--text-3)] truncate mb-0.5">{v.channelTitle}</div>
                <div className="text-[12px] font-semibold line-clamp-2 leading-snug">{v.title}</div>
                <div className="flex gap-3 mt-2 text-[10px] text-[var(--text-3)]">
                  <span>{n(v.views)} views</span>
                  <span>{n(v.likes)} likes</span>
                  <span>{n(v.comments)} 💬</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {mode === 'channel' && channels.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {channels.map(c => (
            <a key={c.id} href={c.url} target="_blank" rel="noopener noreferrer" className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-4 flex gap-3">
              {c.thumbnail && <img src={c.thumbnail} alt={c.title} className="w-16 h-16 rounded-full flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold truncate">{c.title}</div>
                {c.country && <div className="text-[10px] text-[var(--text-3)]">{c.country}</div>}
                <div className="flex gap-3 mt-2 text-[11px]">
                  <div><span className="font-bold">{n(c.subscribers)}</span> <span className="text-[var(--text-3)]">subs</span></div>
                  <div><span className="font-bold">{n(c.videoCount)}</span> <span className="text-[var(--text-3)]">videos</span></div>
                  <div><span className="font-bold">{n(c.viewCount)}</span> <span className="text-[var(--text-3)]">views</span></div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── TikTok trending ── */
interface TTAd { id: string; brand: string; caption: string; cover: string; videoUrl?: string; duration?: number; likes?: number; views?: number; ctr?: number; country?: string; sourceUrl: string }
interface TTHashtag { name: string; views?: number; rank?: number; rankDiff?: number }

function TikTokSource() {
  const [mode, setMode] = useState<'ads' | 'hashtags'>('ads');
  const [region, setRegion] = useState('US'); // TikTok requires a single region — US has broadest catalog
  const [period, setPeriod] = useState('7');
  const [ads, setAds] = useState<TTAd[]>([]);
  const [hashtags, setHashtags] = useState<TTHashtag[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(''); setAds([]); setHashtags([]);
    try {
      const res = await fetch(`/api/tiktok?mode=${mode}&region=${region}&period=${period}&limit=30`);
      const data = await res.json();
      if (data.error) {
        setErr(`${data.error}${data.hint ? ` — ${data.hint}` : ''}`);
      } else {
        if (mode === 'ads') setAds(data.ads || []);
        else setHashtags(data.hashtags || []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, [mode, region, period]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 flex gap-2">
        <select value={mode} onChange={e => setMode(e.target.value as 'ads' | 'hashtags')} className="bg-[var(--bg-alt)] rounded-lg px-2 py-2 text-[11px] outline-none">
          <option value="ads">Top ads</option>
          <option value="hashtags">Trending hashtags</option>
        </select>
        <select value={region} onChange={e => setRegion(e.target.value)} className="bg-[var(--bg-alt)] rounded-lg px-2 py-2 text-[11px] outline-none">
          <option value="IN">🇮🇳 India</option>
          <option value="US">🇺🇸 USA</option>
          <option value="GB">🇬🇧 UK</option>
          <option value="AE">🇦🇪 UAE</option>
          <option value="SG">🇸🇬 SG</option>
          <option value="ID">🇮🇩 ID</option>
          <option value="JP">🇯🇵 JP</option>
        </select>
        <select value={period} onChange={e => setPeriod(e.target.value)} className="bg-[var(--bg-alt)] rounded-lg px-2 py-2 text-[11px] outline-none flex-1">
          <option value="7">Past 7 days</option>
          <option value="30">Past 30 days</option>
          <option value="120">Past 120 days</option>
        </select>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50">{loading ? '…' : 'Refresh'}</button>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] mb-4">{err}</div>}

      {mode === 'ads' && ads.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ads.map(ad => (
            <a key={ad.id} href={ad.sourceUrl} target="_blank" rel="noopener noreferrer" className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
              <div className="aspect-[9/16] bg-[var(--bg-alt)] relative">
                {ad.cover && <img src={ad.cover} alt={ad.caption} className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                {ad.ctr && <div className="absolute top-2 right-2 bg-[var(--brand)] text-white text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded">CTR {(ad.ctr * 100).toFixed(1)}%</div>}
              </div>
              <div className="p-3">
                <div className="text-[11px] font-semibold truncate mb-0.5">{ad.brand}</div>
                <p className="text-[11px] text-[var(--text-2)] line-clamp-2 leading-snug">{ad.caption}</p>
                <div className="flex gap-3 mt-2 text-[10px] text-[var(--text-3)]">
                  {ad.likes !== undefined && <span>♥ {n(ad.likes)}</span>}
                  {ad.views !== undefined && <span>👁 {n(ad.views)}</span>}
                  {ad.duration && <span>{ad.duration}s</span>}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {mode === 'hashtags' && hashtags.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {hashtags.map(h => (
            <div key={h.name} className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[var(--text-3)]">#{h.rank}</span>
                {h.rankDiff !== undefined && h.rankDiff !== 0 && (
                  <span className={`text-[10px] font-bold ${h.rankDiff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {h.rankDiff > 0 ? '↑' : '↓'}{Math.abs(h.rankDiff)}
                  </span>
                )}
              </div>
              <div className="text-[13px] font-bold truncate">#{h.name}</div>
              {h.views !== undefined && <div className="text-[10px] text-[var(--text-3)] mt-0.5">{n(h.views)} posts</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Brave Search ── */
interface BraveResult { title: string; url: string; description: string; age?: string; source?: string; thumbnail?: string }
function BraveSource() {
  const [q, setQ] = useState('eyewear trends');
  const [mode, setMode] = useState<'web' | 'news'>('web');
  const [country, setCountry] = useState('ALL');
  const [freshness, setFreshness] = useState('');
  const [results, setResults] = useState<BraveResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupSteps, setSetupSteps] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!q.trim()) return;
    setLoading(true); setErr(''); setResults([]);
    try {
      const p = new URLSearchParams({ q, mode, country });
      if (freshness) p.set('freshness', freshness);
      const res = await fetch(`/api/brave?${p}`);
      const data = await res.json();
      if (data.needsSetup) {
        setNeedsSetup(true);
        setSetupSteps(data.setupInstructions?.steps || []);
      } else if (data.error) {
        setErr(data.error);
      } else {
        setNeedsSetup(false);
        setResults(data.results || []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed');
    }
    setLoading(false);
  }, [q, mode, country, freshness]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-4 space-y-2">
        <div className="flex gap-2">
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search term…" className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none" onKeyDown={e => { if (e.key === 'Enter') load(); }} />
          <button onClick={load} disabled={loading} className="px-4 py-2 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-50">{loading ? '…' : 'Search'}</button>
        </div>
        <div className="flex gap-2">
          <select value={mode} onChange={e => setMode(e.target.value as 'web' | 'news')} className="bg-[var(--bg-alt)] rounded-lg px-2 py-1.5 text-[11px] outline-none">
            <option value="web">Web</option>
            <option value="news">News</option>
          </select>
          <select value={country} onChange={e => setCountry(e.target.value)} className="bg-[var(--bg-alt)] rounded-lg px-2 py-1.5 text-[11px] outline-none">
            <option value="ALL">🌐 All</option>
            <option value="IN">🇮🇳 IN</option>
            <option value="US">🇺🇸 US</option>
            <option value="GB">🇬🇧 UK</option>
            <option value="AE">🇦🇪 AE</option>
          </select>
          <select value={freshness} onChange={e => setFreshness(e.target.value)} className="flex-1 bg-[var(--bg-alt)] rounded-lg px-2 py-1.5 text-[11px] outline-none">
            <option value="">Any time</option>
            <option value="pd">Past day</option>
            <option value="pw">Past week</option>
            <option value="pm">Past month</option>
            <option value="py">Past year</option>
          </select>
        </div>
      </div>

      {needsSetup && (
        <div className="bg-[var(--surface)] border border-[var(--brand)] rounded-xl p-4 mb-4">
          <div className="text-[14px] font-semibold mb-2">Connect Brave Search API</div>
          <ol className="space-y-2 text-[12px] text-[var(--text-2)] list-decimal list-inside">
            {setupSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <a href="https://api.search.brave.com/app/dashboard" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">Open Brave API Dashboard →</a>
        </div>
      )}

      {err && !needsSetup && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-[12px] mb-4">{err}</div>}

      <div className="space-y-2">
        {results.map((r, i) => (
          <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="block bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 hover:border-[var(--brand)]">
            <div className="flex gap-3">
              {r.thumbnail && <img src={r.thumbnail} alt="" className="w-16 h-16 rounded object-cover flex-shrink-0 bg-[var(--bg-alt)]" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 text-[10px] text-[var(--text-3)]">
                  {r.source && <span className="font-semibold truncate">{r.source}</span>}
                  {r.age && <><span>·</span><span>{r.age}</span></>}
                </div>
                <div className="text-[13px] font-semibold line-clamp-2" dangerouslySetInnerHTML={{ __html: r.title }} />
                <p className="text-[11px] text-[var(--text-2)] line-clamp-2 mt-1" dangerouslySetInnerHTML={{ __html: r.description }} />
              </div>
            </div>
          </a>
        ))}
      </div>
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
