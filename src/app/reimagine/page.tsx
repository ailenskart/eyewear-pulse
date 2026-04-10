'use client';
import { useState, useEffect, useRef } from 'react';

interface GeneratedImage {
  url: string;
  model: string;
}

interface Iteration {
  id: string;
  prompt: string;
  analysis: string;
  brief: string;
  images: GeneratedImage[];
  imagePrompt: string;
  productImageUrl?: string | null;
  productFrameDescription?: string;
  comment: string;
  createdAt: string;
}

interface Project {
  id: string;
  sourceImage: string;
  sourceBrand: string;
  sourceCaption: string;
  sourcePostUrl: string;
  iterations: Iteration[];
  createdAt: string;
}

const n = (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : String(v);

export default function ReimagineStudio() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [frameUpload, setFrameUpload] = useState<{ base64: string; mime: string; preview: string } | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [view, setView] = useState<'studio' | 'history'>('studio');
  const bottomRef = useRef<HTMLDivElement>(null);
  const frameFileRef = useRef<HTMLInputElement>(null);

  const handleFramePick = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const [header, data] = dataUrl.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      setFrameUpload({
        base64: data || '',
        mime: mimeMatch?.[1] || 'image/jpeg',
        preview: dataUrl,
      });
    };
    reader.readAsDataURL(file);
  };

  const submitIteration = () => {
    if (!active) return;
    if (!editPrompt.trim() && !frameUpload) return;
    generateIteration(active, editPrompt, frameUpload);
    setEditPrompt('');
    setFrameUpload(null);
    if (frameFileRef.current) frameFileRef.current.value = '';
  };

  // Load projects from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('reimagine-projects');
    if (saved) {
      const parsed = JSON.parse(saved) as Project[];
      setProjects(parsed);
    }

    // Check if we came from the feed with a post to reimagine
    const params = new URLSearchParams(window.location.search);
    const img = params.get('image');
    const brand = params.get('brand');
    const caption = params.get('caption');
    const postUrl = params.get('postUrl');
    if (img) {
      const newProject: Project = {
        id: Date.now().toString(),
        sourceImage: img,
        sourceBrand: brand || 'Unknown',
        sourceCaption: caption || '',
        sourcePostUrl: postUrl || '',
        iterations: [],
        createdAt: new Date().toISOString(),
      };
      setActive(newProject);
      setView('studio');
      // Auto-generate an initial creative reimagine. The prompt now has
      // a strict identity lock so ethnicity can never drift.
      generateIteration(newProject, '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProjects = (updated: Project[]) => {
    setProjects(updated);
    localStorage.setItem('reimagine-projects', JSON.stringify(updated));
  };

  const generateIteration = async (
    project: Project,
    prompt: string,
    frame?: { base64: string; mime: string } | null,
  ) => {
    setLoading(true);
    try {
      const res = await fetch('/api/reimagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: project.sourceImage,
          prompt,
          frameImageBase64: frame?.base64,
          frameImageMime: frame?.mime,
        }),
      });
      const data = await res.json();

      const iteration: Iteration = {
        id: Date.now().toString(),
        prompt: prompt || 'Default: Reimagine for Lenskart',
        analysis: data.originalAnalysis || '',
        brief: data.creativeBrief || data.error || '',
        images: data.generatedImages || [],
        imagePrompt: data.imagePrompt || '',
        productImageUrl: data.productImageUrl || null,
        productFrameDescription: data.productFrameDescription || '',
        comment: '',
        createdAt: new Date().toISOString(),
      };

      const updated = { ...project, iterations: [...project.iterations, iteration] };
      setActive(updated);

      // Save to history
      const existingIdx = projects.findIndex(p => p.id === project.id);
      const updatedProjects = [...projects];
      if (existingIdx >= 0) {
        updatedProjects[existingIdx] = updated;
      } else {
        updatedProjects.unshift(updated);
      }
      saveProjects(updatedProjects);
    } catch {
      // Error handled
    }
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
  };

  const addComment = (iterationId: string, comment: string) => {
    if (!active) return;
    const updated = {
      ...active,
      iterations: active.iterations.map(it =>
        it.id === iterationId ? { ...it, comment } : it
      ),
    };
    setActive(updated);
    const updatedProjects = projects.map(p => p.id === active.id ? updated : p);
    saveProjects(updatedProjects);
    setEditingComment(null);
    setCommentText('');
  };

  const deleteProject = (id: string) => {
    const updated = projects.filter(p => p.id !== id);
    saveProjects(updated);
    if (active?.id === id) setActive(null);
  };

  const clearIterations = () => {
    if (!active) return;
    const cleared = { ...active, iterations: [] };
    setActive(cleared);
    const updatedProjects = projects.map(p => p.id === active.id ? cleared : p);
    saveProjects(updatedProjects);
  };

  const regenerateIteration = (it: Iteration) => {
    if (!active || loading) return;
    // Strip any URL from the stored prompt so we only pass the user note;
    // the default "no prompt" case triggers the latest face-nudge edit direction.
    const originalPrompt = it.prompt === 'Default: Reimagine for Lenskart' ? '' : it.prompt;
    generateIteration(active, originalPrompt);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]" style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--bg)] border-b border-[var(--line)]" style={{ backdropFilter: 'blur(20px)', background: 'color-mix(in srgb, var(--bg) 90%, transparent)' }}>
        <div className="max-w-3xl mx-auto flex items-center h-12 px-4 gap-3">
          <a href="/" className="text-[var(--text-2)] hover:text-[var(--text)]">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </a>
          <h1 className="text-[15px] font-semibold flex-1">Reimagine Studio</h1>
          <div className="flex bg-[var(--bg-alt)] rounded-lg p-[2px]">
            <button onClick={() => setView('studio')} className={`px-3 py-1 rounded-md text-[12px] font-medium ${view === 'studio' ? 'bg-[var(--surface)] shadow-sm' : 'text-[var(--text-3)]'}`}>Studio</button>
            <button onClick={() => setView('history')} className={`px-3 py-1 rounded-md text-[12px] font-medium ${view === 'history' ? 'bg-[var(--surface)] shadow-sm' : 'text-[var(--text-3)]'}`}>History ({projects.length})</button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {/* ── HISTORY VIEW ── */}
        {view === 'history' && (
          <div className="space-y-3">
            {projects.length === 0 && (
              <div className="text-center py-16 text-[var(--text-3)]">
                <p className="text-[14px]">No reimagined posts yet</p>
                <p className="text-[12px] mt-1">Go to Feed → tap any post → Reimagine for Lenskart</p>
              </div>
            )}
            {projects.map(p => (
              <div key={p.id} className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden cursor-pointer" onClick={() => { setActive(p); setView('studio'); }}>
                <div className="flex gap-3 p-3">
                  <img src={p.sourceImage} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold">{p.sourceBrand}</div>
                    <p className="text-[11px] text-[var(--text-2)] line-clamp-1">{p.sourceCaption}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-[var(--text-3)]">{p.iterations.length} iteration{p.iterations.length !== 1 ? 's' : ''}</span>
                      <span className="text-[10px] text-[var(--text-3)]">{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }} className="text-[var(--text-3)] self-start p-1">
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
                {/* Show last generated images if any */}
                {p.iterations.length > 0 && p.iterations[p.iterations.length - 1].images?.length > 0 && (
                  <div className="grid grid-cols-2 gap-[1px] border-t border-[var(--line)]">
                    {p.iterations[p.iterations.length - 1].images.slice(0, 2).map((img, i) => (
                      <img key={i} src={img.url} alt="" className="w-full h-20 object-cover" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── STUDIO VIEW ── */}
        {view === 'studio' && !active && (
          <div className="text-center py-16 text-[var(--text-3)]">
            <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="mx-auto mb-3 opacity-30"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            <p className="text-[14px]">No post selected</p>
            <p className="text-[12px] mt-1">Go to <a href="/" className="text-[var(--brand)] font-medium">Feed</a> → tap any post → Reimagine for Lenskart</p>
            {projects.length > 0 && (
              <button onClick={() => setView('history')} className="mt-4 px-4 py-2 bg-[var(--bg-alt)] rounded-lg text-[13px] font-medium">
                View History ({projects.length})
              </button>
            )}
          </div>
        )}

        {view === 'studio' && active && (
          <div className="space-y-4">
            {/* Source post — big, Instagram-style */}
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--line)]">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--brand)] to-purple-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold truncate">{active.sourceBrand}</div>
                  <div className="text-[10px] text-[var(--text-3)]">Original post</div>
                </div>
                {active.sourcePostUrl && (
                  <a href={active.sourcePostUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--brand)] text-[11px] font-semibold px-2 py-1">View on IG</a>
                )}
              </div>
              <img src={active.sourceImage} alt="" className="w-full aspect-square object-cover" />
              {active.sourceCaption && (
                <p className="px-3 py-2.5 text-[12px] text-[var(--text-2)] leading-relaxed whitespace-pre-wrap">{active.sourceCaption}</p>
              )}
            </div>

            {/* Thread connector */}
            {(active.iterations.length > 0 || loading) && (
              <div className="flex items-center gap-2 pl-4">
                <div className="w-px h-6 bg-[var(--line)]" />
                <span className="text-[10px] text-[var(--text-3)] uppercase tracking-wider font-medium">Reimagined thread</span>
                {active.iterations.length > 0 && !loading && (
                  <button onClick={clearIterations} className="ml-auto text-[10px] text-[var(--text-3)] hover:text-[var(--brand)] uppercase tracking-wider font-medium mr-1">
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Iterations */}
            {active.iterations.map((it, idx) => (
              <div key={it.id} className="bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden" style={{ animation: 'up 0.3s ease' }}>
                {/* Header */}
                <div className="p-3 border-b border-[var(--line)] flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[12px] font-semibold">Iteration {idx + 1}</span>
                    <span className="text-[10px] text-[var(--text-3)] ml-2">{it.prompt}</span>
                  </div>
                  <button
                    onClick={() => regenerateIteration(it)}
                    disabled={loading}
                    title="Regenerate with latest prompt"
                    className="text-[10px] text-[var(--brand)] font-semibold px-2 py-1 rounded hover:bg-[var(--bg-alt)] disabled:opacity-40 flex items-center gap-1"
                  >
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                    Regenerate
                  </button>
                  <span className="text-[10px] text-[var(--text-3)] flex-shrink-0">{new Date(it.createdAt).toLocaleTimeString()}</span>
                </div>

                {/* Product reference (when Lenskart URL was provided) */}
                {it.productImageUrl && (
                  <div className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-alt)] border-b border-[var(--line)]">
                    <img src={it.productImageUrl} alt="Target frames" className="w-14 h-14 rounded-lg object-cover bg-white flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-[var(--brand)] font-semibold uppercase tracking-wide">Target frames</div>
                      {it.productFrameDescription && (
                        <p className="text-[11px] text-[var(--text-2)] leading-snug line-clamp-2 mt-0.5">{it.productFrameDescription}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Generated images — multiple models */}
                {it.images && it.images.length > 0 && (
                  <div className="border-b border-[var(--line)]">
                    <div className={`grid ${it.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-[1px] bg-[var(--line)]`}>
                      {it.images.map((img, imgIdx) => (
                        <div key={imgIdx} className="bg-[var(--bg)] relative">
                          <img src={img.url} alt={`Generated by ${img.model}`} className="w-full aspect-square object-cover" loading="lazy" />
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 flex items-center justify-between">
                            <span className="text-white text-[10px] font-medium">{img.model}</span>
                            <a href={img.url} target="_blank" rel="noopener noreferrer" className="text-white/80 text-[10px] hover:text-white">Open</a>
                          </div>
                        </div>
                      ))}
                    </div>
                    {it.imagePrompt && (
                      <details className="px-3 py-1.5 bg-[var(--bg-alt)]">
                        <summary className="text-[10px] text-[var(--text-3)] cursor-pointer">Image prompt used</summary>
                        <p className="text-[10px] text-[var(--text-2)] mt-1 leading-relaxed">{it.imagePrompt}</p>
                      </details>
                    )}
                  </div>
                )}

                {/* Analysis (collapsible) */}
                {it.analysis && (
                  <details className="border-b border-[var(--line)]">
                    <summary className="px-3 py-2 text-[11px] font-medium text-[var(--text-2)] cursor-pointer">Image Analysis</summary>
                    <div className="px-3 pb-3 text-[11px] text-[var(--text-2)] whitespace-pre-wrap leading-relaxed">{it.analysis}</div>
                  </details>
                )}

                {/* Brief */}
                <div className="p-3 text-[12px] whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">{it.brief}</div>

                {/* Comment */}
                <div className="px-3 pb-3 border-t border-[var(--line)] pt-2">
                  {it.comment && editingComment !== it.id ? (
                    <div className="flex gap-2">
                      <div className="flex-1 bg-[var(--bg-alt)] rounded-lg p-2 text-[12px]">
                        <span className="text-[10px] text-[var(--brand)] font-semibold block mb-0.5">Your note:</span>
                        {it.comment}
                      </div>
                      <button onClick={() => { setEditingComment(it.id); setCommentText(it.comment); }} className="text-[var(--text-3)] text-[11px] self-start">Edit</button>
                    </div>
                  ) : editingComment === it.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
                        autoFocus placeholder="Add feedback or notes..."
                        className="flex-1 bg-[var(--bg-alt)] rounded-lg px-3 py-2 text-[12px] outline-none placeholder:text-[var(--text-3)]"
                        onKeyDown={e => { if (e.key === 'Enter') addComment(it.id, commentText); }}
                      />
                      <button onClick={() => addComment(it.id, commentText)} className="px-3 py-2 bg-[var(--brand)] text-white text-[11px] font-semibold rounded-lg">Save</button>
                      <button onClick={() => setEditingComment(null)} className="text-[var(--text-3)] text-[11px]">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingComment(it.id); setCommentText(''); }}
                      className="text-[12px] text-[var(--text-3)] hover:text-[var(--brand)]">+ Add note</button>
                  )}
                </div>
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-6 flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
                <span className="text-[13px] text-[var(--text-2)]">Generating with AI...</span>
              </div>
            )}

            {/* New iteration input — always visible so users can act on the source photo */}
            {!loading && (
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
                <div className="text-[12px] font-semibold mb-2">
                  {active.iterations.length === 0 ? 'Swap the frames' : 'Edit & iterate'}
                </div>
                {active.iterations.length === 0 && (
                  <p className="text-[11px] text-[var(--text-2)] leading-relaxed mb-3">
                    Upload a clean photo of the target eyewear, or paste a product URL. The model in the original photo is preserved — only the frames change.
                  </p>
                )}

                {/* Uploaded frame preview */}
                {frameUpload && (
                  <div className="flex items-center gap-2 mb-2 p-2 bg-[var(--bg-alt)] rounded-lg">
                    <img src={frameUpload.preview} alt="Target frames" className="w-12 h-12 rounded-md object-cover bg-white" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-[var(--brand)]">Target frames attached</div>
                      <div className="text-[10px] text-[var(--text-3)]">These frames will be applied to the source photo</div>
                    </div>
                    <button onClick={() => { setFrameUpload(null); if (frameFileRef.current) frameFileRef.current.value = ''; }} className="text-[var(--text-3)] text-[16px] leading-none px-2" aria-label="Remove">×</button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text" value={editPrompt} onChange={e => setEditPrompt(e.target.value)}
                    placeholder={frameUpload ? 'Optional notes…' : 'Paste Lenskart URL, upload frame photo, or add notes…'}
                    className="flex-1 min-w-0 bg-[var(--bg-alt)] rounded-lg px-3 py-2.5 text-[12px] outline-none placeholder:text-[var(--text-3)]"
                    onKeyDown={e => { if (e.key === 'Enter') submitIteration(); }}
                  />
                  <input
                    ref={frameFileRef}
                    type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFramePick(f); }}
                  />
                  <button
                    type="button"
                    onClick={() => frameFileRef.current?.click()}
                    title="Upload eyeglasses photo"
                    className="px-3 py-2.5 bg-[var(--bg-alt)] text-[var(--text)] rounded-lg flex-shrink-0 hover:bg-[var(--line)] flex items-center justify-center"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </button>
                  <button
                    onClick={submitIteration}
                    disabled={!editPrompt.trim() && !frameUpload}
                    className="px-4 py-2.5 bg-[var(--brand)] text-white text-[12px] font-semibold rounded-lg disabled:opacity-40 flex-shrink-0"
                  >Reimagine</button>
                </div>
                <p className="text-[10px] text-[var(--text-3)] mt-2 leading-snug">
                  Tip: Lenskart.com PDPs can&apos;t be scraped — upload a clean photo of the frames for best results.
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg)] border-t border-[var(--line)] flex justify-around" style={{ paddingTop: 8, paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        <a href="/" className="flex flex-col items-center gap-[2px] py-1 px-3 text-[var(--text-3)]">
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
          <span className="text-[10px] font-medium">Feed</span>
        </a>
        <button className="flex flex-col items-center gap-[2px] py-1 px-3 text-[var(--brand)]">
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span className="text-[10px] font-medium">Studio</span>
        </button>
      </nav>
    </div>
  );
}
