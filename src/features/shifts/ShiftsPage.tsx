'use client';

import * as React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

interface FrameExample { entity: string; entityName: string; image: string; url: string }
interface WearShift {
  id: string; label: string; heroImage: string; heroUrl: string;
  people: number; priorPeople: number; growth: number; isNew: boolean; posts: number;
  examples: FrameExample[];
}
interface LaunchShift {
  id: string; label: string; heroImage: string; heroUrl: string;
  brands: number; products: number; examples: FrameExample[];
}
interface ShiftsData {
  refDate: string; window: number; region: string;
  wearing: WearShift[]; launching: LaunchShift[]; summary: string;
  meta: {
    igEmbedded: number; igTotal: number;
    productEmbedded: number; productTotal: number;
    clusteredCurrent: number; needsBackfill: boolean;
  };
  cached: boolean;
}

const WINDOWS = [14, 30, 60];

export function ShiftsPage() {
  const [window, setWindow] = React.useState(30);
  const [data, setData] = React.useState<ShiftsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback((refresh = false) => {
    setLoading(true);
    fetch(`/api/shifts?window=${window}${refresh ? '&refresh=1' : ''}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [window]);

  React.useEffect(() => { load(false); }, [load]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Shifts</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5 max-w-2xl">
            Specific frames a lot of people are wearing right now — and the frames brands are launching.
            Grouped by what the glasses actually look like.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {WINDOWS.map(w => (
            <button key={w} onClick={() => setWindow(w)}
              className={cn('h-8 px-2.5 rounded-[var(--radius)] text-[12px] font-semibold transition-colors',
                window === w ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:bg-[var(--border)]')}>
              {w}d
            </button>
          ))}
          <Button size="sm" variant="secondary" onClick={() => load(true)} loading={loading}>Refresh</Button>
        </div>
      </div>

      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="aspect-[4/5]" />)}
        </div>
      )}

      {data && (
        <>
          {data.meta.needsBackfill ? (
            <BackfillNotice meta={data.meta} />
          ) : (
            <p className="text-[13px] leading-relaxed text-[var(--ink-muted)] mb-6">{data.summary}</p>
          )}

          {/* Lead lane — frames people are wearing */}
          <Section title="Frames people are wearing" count={data.wearing.length}
            empty="No frame has enough people wearing it in this window yet. Try a wider window.">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.wearing.map(s => <WearCard key={s.id} s={s} />)}
            </div>
          </Section>

          {/* Secondary lane — brands launching */}
          {data.launching.length > 0 && (
            <Section title="Brands launching the same frame" count={data.launching.length} empty="">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.launching.map(s => <LaunchCard key={s.id} s={s} />)}
              </div>
            </Section>
          )}

          <div className="text-[10px] text-[var(--ink-muted)] mt-8 border-t border-[var(--border)] pt-3">
            Visual index: {data.meta.igEmbedded.toLocaleString()} / {data.meta.igTotal.toLocaleString()} posts ·{' '}
            {data.meta.productEmbedded.toLocaleString()} / {data.meta.productTotal.toLocaleString()} products indexed
            {data.cached && ' · cached'}
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[14px] font-semibold tracking-tight mb-3">{title}</h2>
      {count === 0 && empty
        ? <Card padding="md"><p className="text-[12px] text-[var(--ink-muted)]">{empty}</p></Card>
        : children}
    </section>
  );
}

function Hero({ image, url, alt }: { image: string; url: string; alt: string }) {
  return (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer" className="block relative aspect-[4/5] bg-[var(--surface-2)] overflow-hidden">
      {image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={image} alt={alt} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" loading="lazy" />
        : <div className="w-full h-full grid place-items-center text-[var(--ink-soft)] text-[11px]">no image</div>}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/65 to-transparent" />
    </a>
  );
}

function Avatars({ examples, total }: { examples: FrameExample[]; total: number }) {
  const shown = examples.filter(e => e.image).slice(0, 5);
  const extra = total - shown.length;
  return (
    <div className="flex items-center gap-1.5 mt-2">
      <div className="flex -space-x-2">
        {shown.map((e, i) => (
          <a key={i} href={e.url || '#'} target="_blank" rel="noopener noreferrer" title={e.entityName}
            className="w-6 h-6 rounded-full ring-2 ring-[var(--surface)] overflow-hidden bg-[var(--surface-2)] hover:z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.image} alt={e.entityName} className="w-full h-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
      {extra > 0 && <span className="text-[10px] text-[var(--ink-muted)]">+{extra} more</span>}
    </div>
  );
}

function WearCard({ s }: { s: WearShift }) {
  return (
    <Card variant="photographic" padding="none" className="group">
      <div className="relative">
        <Hero image={s.heroImage} url={s.heroUrl} alt={s.label || 'frame'} />
        {(s.isNew || s.growth > 0) && (
          <div className="absolute top-2 right-2">
            <Badge tone={s.isNew ? 'danger' : 'success'} size="xs">{s.isNew ? 'NEW' : `+${s.growth}`}</Badge>
          </div>
        )}
        <div className="absolute bottom-2 left-2.5 right-2.5 text-white">
          <div className="text-[15px] font-bold leading-none">Worn by {s.people}</div>
          {s.label && <div className="text-[11px] capitalize opacity-90 mt-0.5 truncate">{s.label}</div>}
        </div>
      </div>
      <div className="px-2.5 pb-2.5">
        <Avatars examples={s.examples} total={s.people} />
      </div>
    </Card>
  );
}

function LaunchCard({ s }: { s: LaunchShift }) {
  return (
    <Card variant="photographic" padding="none" className="group">
      <div className="relative">
        <Hero image={s.heroImage} url={s.heroUrl} alt={s.label || 'frame'} />
        <div className="absolute top-2 right-2"><Badge tone="accent" size="xs">{s.brands} brands</Badge></div>
        <div className="absolute bottom-2 left-2.5 right-2.5 text-white">
          <div className="text-[15px] font-bold leading-none">{s.brands} brands</div>
          {s.label && <div className="text-[11px] capitalize opacity-90 mt-0.5 truncate">{s.label}</div>}
        </div>
      </div>
      <div className="px-2.5 pb-2.5">
        <Avatars examples={s.examples} total={s.brands} />
      </div>
    </Card>
  );
}

function BackfillNotice({ meta }: { meta: ShiftsData['meta'] }) {
  return (
    <Card padding="lg" className="mb-6 bg-gradient-to-br from-[var(--accent-soft)] to-[var(--surface)]">
      <Badge tone="accent">Visual index building</Badge>
      <p className="text-[14px] leading-relaxed mt-2">
        Shifts groups the same frame by what it looks like, which needs each photo run through the
        image model first. None are indexed yet.
      </p>
      <p className="text-[12px] text-[var(--ink-muted)] mt-2">
        Set <code className="font-mono">REPLICATE_API_TOKEN</code> on the server, then run the embedder:{' '}
        <code className="font-mono">/api/shifts/embed?key=…&amp;type=ig_post</code> (repeat until done).
        Indexed so far: {meta.igEmbedded}/{meta.igTotal} posts, {meta.productEmbedded}/{meta.productTotal} products.
      </p>
    </Card>
  );
}
