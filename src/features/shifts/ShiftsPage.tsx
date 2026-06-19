'use client';

import * as React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

interface ShiftExample {
  account?: string; accountName?: string;
  brand?: string; brandName?: string;
  title?: string; price?: number | null; currency?: string | null;
  imageUrl: string; url: string; likes?: number;
}
interface PickingUpShift {
  signature: string; label: string;
  currentAccounts: number; priorAccounts: number; accountsDelta: number;
  deltaPct: number; isNew: boolean; posts: number; momentum: number;
  examples: ShiftExample[];
}
interface LaunchingShift {
  signature: string; label: string;
  brands: number; recentBrands: number; products: number; momentum: number;
  examples: ShiftExample[];
}
interface ShiftsData {
  refDate: string; window: number; region: string;
  pickingUp: PickingUpShift[]; launching: LaunchingShift[];
  summary: string;
  meta: {
    postsCurrent: number; postsPrior: number;
    visionAnalyzed: number; visionPending: number;
    productsScanned: number; visionEnabled: boolean;
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
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Shifts</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5 max-w-2xl">
            Only what&apos;s actually moving — specific frames an accelerating number of accounts are
            picking up, and frames many brands are launching at once. No generic eyewear.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {WINDOWS.map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={cn(
                'h-8 px-2.5 rounded-[var(--radius)] text-[12px] font-semibold transition-colors',
                window === w ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:bg-[var(--border)]',
              )}
            >{w}d</button>
          ))}
          <Button size="sm" variant="secondary" onClick={() => load(true)} loading={loading}>Rescan</Button>
        </div>
      </div>

      {loading && !data && <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div>}

      {data && (
        <>
          <Card padding="lg" className="mb-6 bg-gradient-to-br from-[var(--accent-soft)] to-[var(--surface)]">
            <div className="flex items-start justify-between gap-3 mb-2">
              <Badge tone="accent">What moved</Badge>
              {data.cached && <Badge size="xs">Cached</Badge>}
            </div>
            <p className="text-[14px] leading-relaxed">{data.summary}</p>
            <div className="text-[10px] text-[var(--ink-muted)] mt-3">
              {data.meta.postsCurrent} posts this period vs {data.meta.postsPrior} prior ·{' '}
              {data.meta.visionEnabled
                ? `${data.meta.visionAnalyzed} newly scanned${data.meta.visionPending > 0 ? `, ${data.meta.visionPending} pending (rescan to fill in)` : ''}`
                : 'Vision off'}{' '}· {data.meta.productsScanned} products
            </div>
          </Card>

          <Lane
            title="Picking up on Instagram"
            subtitle="Frames gaining distinct accounts week-over-week"
            empty="No frame is accelerating across enough accounts yet. Rescan to scan more posts, or widen the window."
          >
            {data.pickingUp.map(s => <PickCard key={s.signature} s={s} />)}
          </Lane>

          <Lane
            title="Brands launching"
            subtitle="Concrete frames multiple brands are converging on"
            empty="No cross-brand convergence above the threshold. This lane sharpens as product scrapes accumulate launch history."
          >
            {data.launching.map(s => <LaunchCard key={s.signature} s={s} />)}
          </Lane>
        </>
      )}
    </div>
  );
}

function Lane({ title, subtitle, empty, children }: {
  title: string; subtitle: string; empty: string; children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
        <p className="text-[11px] text-[var(--ink-muted)]">{subtitle}</p>
      </div>
      {items.length === 0
        ? <Card padding="md"><p className="text-[12px] text-[var(--ink-muted)]">{empty}</p></Card>
        : <div className="grid sm:grid-cols-2 gap-3">{items}</div>}
    </section>
  );
}

function Thumbs({ examples, max = 4 }: { examples: ShiftExample[]; max?: number }) {
  const shown = examples.filter(e => e.imageUrl).slice(0, max);
  if (shown.length === 0) return null;
  return (
    <div className="flex gap-1.5 mt-3">
      {shown.map((e, i) => (
        <a
          key={i}
          href={e.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block w-1/4 aspect-square rounded-[var(--radius)] overflow-hidden bg-[var(--surface-2)] group"
          title={e.accountName || e.brandName || ''}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.imageUrl} alt={e.accountName || e.brandName || 'frame'} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
          <span className="absolute bottom-0 inset-x-0 px-1 py-0.5 text-[8px] font-medium text-white bg-black/55 truncate">
            {e.accountName || e.brandName}
          </span>
        </a>
      ))}
    </div>
  );
}

function PickCard({ s }: { s: PickingUpShift }) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold capitalize leading-tight">{s.label}</h3>
        <Badge tone={s.isNew ? 'danger' : 'accent'} size="xs">
          {s.isNew ? 'NEW' : `+${s.accountsDelta}`}
        </Badge>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--ink-muted)]">
        <span><span className="font-semibold text-[var(--ink)]">{s.currentAccounts}</span> accounts</span>
        <span>·</span>
        <span>{s.posts} posts</span>
        {!s.isNew && <><span>·</span><span className={s.deltaPct >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
          {s.deltaPct >= 0 ? '+' : ''}{s.deltaPct > 998 ? '∞' : s.deltaPct}%
        </span></>}
      </div>
      <Thumbs examples={s.examples} />
    </Card>
  );
}

function LaunchCard({ s }: { s: LaunchingShift }) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold capitalize leading-tight">{s.label}</h3>
        <Badge tone="accent" size="xs">{s.brands} brands</Badge>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--ink-muted)]">
        <span><span className="font-semibold text-[var(--ink)]">{s.brands}</span> brands converging</span>
        <span>·</span>
        <span>{s.products} SKUs</span>
        {s.recentBrands > 0 && <><span>·</span><span className="text-[var(--success)]">{s.recentBrands} fresh</span></>}
      </div>
      <Thumbs examples={s.examples} />
    </Card>
  );
}
