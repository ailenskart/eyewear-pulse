'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

/* ═══ Types ═══ */
interface Post {
  id: string;
  brand: { name: string; handle: string; category: string; region: string; priceRange: string };
  imageUrl: string; videoUrl: string | null; carouselSlides: Array<{ url: string; type: string }>;
  caption: string; likes: number; comments: number; engagement: number;
  hashtags: string[]; postedAt: string; postUrl: string; type: string; isVideo: boolean;
}
interface Stats { totalPosts: number; totalBrands: number; avgEngagement: number; topHashtags: Array<{ name: string; count: number }>; contentMix: Array<{ name: string; count: number }>; byCategory: Array<{ name: string; count: number }>; byRegion: Array<{ name: string; count: number }>; }
interface Feed { posts: Post[]; total: number; page: number; totalPages: number; stats: Stats; }

/* ═══ Util ═══ */
const n = (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : String(v);
const t = (d: string) => { const h = Math.floor((Date.now()-new Date(d).getTime())/36e5); return h<1?'now':h<24?h+'h':Math.floor(h/24)+'d'; };

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
          <h1 className="text-[15px] font-semibold whitespace-nowrap">EyeWear Pulse</h1>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[3px] sm:gap-2 pb-4">
            {data?.posts.map((p, i) => (
              <div key={p.id} className="relative cursor-pointer group overflow-hidden rounded-sm sm:rounded-lg" onClick={() => setOpen(p)} style={{ animation: `up 0.3s ease ${i*20}ms both` }}>
                <div className="aspect-square bg-[var(--bg-alt)] overflow-hidden">
                  <img src={p.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                </div>
                {/* Hover info */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 sm:p-3">
                  <div className="text-white text-[11px] sm:text-[12px] font-semibold">{p.brand.name}</div>
                  <div className="flex gap-3 text-white/80 text-[10px] sm:text-[11px] mt-0.5">
                    <span>{n(p.likes)} likes</span>
                    <span>{n(p.comments)} comments</span>
                  </div>
                </div>
                {/* Badges */}
                {p.isVideo && <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/80 flex items-center justify-center"><svg width="10" height="10" viewBox="0 0 24 24" fill="#111"><path d="M8 5v14l11-7z"/></svg></div>}
                {p.carouselSlides.length > 0 && !p.isVideo && <div className="absolute top-1.5 right-1.5 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{p.carouselSlides.length+1}</div>}
              </div>
            ))}
          </div>
        )}

        {/* ── List View ── */}
        {tab === 'feed' && mode === 'list' && (
          <div className="pb-4 max-w-xl mx-auto divide-y divide-[var(--line)]">
            {data?.posts.map((p, i) => (
              <div key={p.id} className="flex gap-3 py-3 cursor-pointer" onClick={() => setOpen(p)} style={{ animation: `up 0.3s ease ${i*30}ms both` }}>
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-[var(--bg-alt)] flex-shrink-0">
                  <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                </div>
                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold">{p.brand.name}</span>
                    <span className="text-[10px] text-[var(--text-3)]">{t(p.postedAt)}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-2)] mt-0.5 line-clamp-2 leading-relaxed">{p.caption}</p>
                  <div className="flex gap-3 mt-1.5 text-[11px] text-[var(--text-3)]">
                    <span className="font-semibold text-[var(--text)]">{n(p.likes)} likes</span>
                    <span>{n(p.comments)} comments</span>
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
        <div className="bg-[var(--bg)] w-full sm:max-w-3xl sm:rounded-2xl overflow-hidden rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col sm:flex-row shadow-2xl" style={{ animation: 'sheet 0.25s ease-out' }}>

          {/* Media */}
          <div className="sm:w-[56%] bg-black relative flex-shrink-0">
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
              <img src={slides[si]} alt="" className="w-full max-h-[55vh] sm:max-h-none sm:h-full object-contain" onError={() => setErr(true)} />
            )}
            {/* Carousel nav */}
            {slides.length > 1 && !post.isVideo && (
              <>
                {si > 0 && <button onClick={() => setSi(i=>i-1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-sm font-bold">‹</button>}
                {si < slides.length-1 && <button onClick={() => setSi(i=>i+1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-sm font-bold">›</button>}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {slides.map((_,i) => <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i===si ? 'bg-white w-4' : 'bg-white/40'}`}/>)}
                </div>
              </>
            )}
          </div>

          {/* Info */}
          <div className="sm:w-[44%] flex flex-col">
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
            <div className="p-3 border-t border-[var(--line)] flex gap-2">
              <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-lg bg-[var(--brand)] text-white text-[13px] font-semibold text-center">View on Instagram</a>
              <a href={`https://instagram.com/${post.brand.handle}`} target="_blank" rel="noopener noreferrer" className="py-2.5 px-4 rounded-lg border border-[var(--line)] text-[13px] font-medium text-center">Profile</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Products ═══ */
function Products() {
  const [items, setItems] = useState<Array<Record<string,unknown>>>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState('All');
  const [pg, setPg] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch(`/api/products?brand=${brand}&page=${pg}&limit=24&sortBy=price_asc`).then(r=>r.json()).then(d => {
      setItems(d.products||[]); setBrands(d.brands||[]); setTotal(d.total||0);
    });
  }, [brand, pg]);

  return (
    <div className="py-4">
      <div className="flex gap-2 pb-3 overflow-x-auto" style={{ scrollbarWidth:'none' }}>
        <button onClick={()=>{setBrand('All');setPg(1);}} className={`px-3 py-[5px] rounded-full text-[12px] font-medium whitespace-nowrap flex-shrink-0 ${brand==='All'?'bg-[var(--text)] text-[var(--bg)]':'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}>All ({total})</button>
        {brands.slice(0,25).map(b => (
          <button key={b} onClick={()=>{setBrand(b);setPg(1);}} className={`px-3 py-[5px] rounded-full text-[12px] font-medium whitespace-nowrap flex-shrink-0 ${brand===b?'bg-[var(--text)] text-[var(--bg)]':'bg-[var(--bg-alt)] text-[var(--text-2)]'}`}>{b}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {items.map((p, i) => (
          <a key={i} href={String(p.url||'#')} target="_blank" rel="noopener noreferrer" className="bg-[var(--surface)] rounded-xl overflow-hidden border border-[var(--line)] hover:shadow-md transition-shadow" style={{animation:`up 0.3s ease ${i*15}ms both`}}>
            <div className="aspect-square bg-white p-2">
              <img src={String(p.image||'')} alt="" className="w-full h-full object-contain" loading="lazy" onError={e=>{(e.target as HTMLImageElement).style.display='none';}} />
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-[var(--brand)] font-semibold uppercase tracking-wide">{String(p.brand)}</div>
              <div className="text-[12px] font-medium mt-0.5 line-clamp-2 leading-snug">{String(p.name)}</div>
              <div className="text-[14px] font-bold mt-1">{String(p.price)}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ═══ Intel ═══ */
function Intel({ stats }: { stats: Stats }) {
  return (
    <div className="py-4 space-y-6">
      <div className="grid grid-cols-3 gap-2">
        {[{v:n(stats.totalPosts),l:'Posts'},{v:String(stats.totalBrands),l:'Brands'},{v:stats.avgEngagement+'%',l:'Avg Eng.'}].map(s => (
          <div key={s.l} className="bg-[var(--bg-alt)] rounded-xl p-4 text-center">
            <div className="text-xl font-bold">{s.v}</div>
            <div className="text-[11px] text-[var(--text-3)] mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-[14px] font-semibold mb-3">By Category</h3>
        {stats.byCategory.map(c => (
          <div key={c.name} className="flex items-center gap-2 mb-2">
            <span className="text-[12px] w-24 text-[var(--text-2)]">{c.name}</span>
            <div className="flex-1 h-[6px] bg-[var(--bg-alt)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--brand)] rounded-full transition-all" style={{width:`${(c.count/stats.totalPosts)*100}%`}} />
            </div>
            <span className="text-[11px] text-[var(--text-3)] w-8 text-right">{c.count}</span>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-[14px] font-semibold mb-3">Trending Tags</h3>
        <div className="flex flex-wrap gap-2">
          {stats.topHashtags.map(h => (
            <span key={h.name} className="px-2.5 py-1 bg-[var(--bg-alt)] rounded-full text-[12px]">#{h.name} <span className="text-[var(--text-3)]">{h.count}</span></span>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[14px] font-semibold mb-3">Regions</h3>
        <div className="grid grid-cols-2 gap-2">
          {stats.byRegion.map(r => (
            <div key={r.name} className="bg-[var(--bg-alt)] rounded-lg p-3 flex items-center justify-between">
              <span className="text-[12px] text-[var(--text-2)]">{r.name}</span>
              <span className="text-[13px] font-bold">{r.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
