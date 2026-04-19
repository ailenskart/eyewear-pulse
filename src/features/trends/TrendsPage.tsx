'use client';

import * as React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

interface RankedAttr {
  value: string;
  count: number;
  weightedCount: number;
  priorCount: number;
  delta: number;
  deltaPct: number;
  topExample?: { brand: string; handle: string; imageUrl: string; postUrl: string };
}

interface MustDoItem {
  headline: string;
  rationale: string;
  category: string;
  urgency: 'now' | 'this-week' | 'watch';
}

interface TrendsData {
  region: string;
  totalAnalyzed: number;
  topShapes: RankedAttr[];
  topColors: RankedAttr[];
  topMaterials: RankedAttr[];
  topStyles: RankedAttr[];
  mustDo: MustDoItem[];
  summary: string;
  cached: boolean;
}

const REGIONS: Array<{ k: string; label: string }> = [
  { k: 'ALL', label: 'Global' },
  { k: 'North America', label: 'NA' },
  { k: 'Europe', label: 'EU' },
  { k: 'Asia Pacific', label: 'APAC' },
  { k: 'South Asia', label: 'SA' },
];

export function TrendsPage() {
  const [region, setRegion] = React.useState('ALL');
  const [data, setData] = React.useState<TrendsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback((refresh = false) => {
    setLoading(true);
    fetch(`/api/visual-trends?region=${encodeURIComponent(region)}${refresh ? '&refresh=1' : ''}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [region]);

  React.useEffect(() => { load(false); }, [load]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Trends</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            Gemini Vision weekly analysis · shape, color, material, style shifts
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => load(true)} loading={loading}>Regenerate</Button>
      </div>

      {/* Region tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {REGIONS.map(r => (
          <button
            key={r.k}
            onClick={() => setRegion(r.k)}
            className={cn(
              'h-8 px-3 rounded-[var(--radius)] text-[12px] font-semibold whitespace-nowrap transition-colors',
              region === r.k ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:bg-[var(--border)]',
            )}
          >{r.label}</button>
        ))}
      </div>

      {loading && !data && <div className="space-y-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}</div>}

      {data && (
        <>
          {/* Summary */}
          <Card padding="lg" className="mb-6 bg-gradient-to-br from-[var(--accent-soft)] to-[var(--surface)]">
            <div className="flex items-start justify-between gap-3 mb-2">
              <Badge tone="accent">Weekly Summary</Badge>
              {data.cached && <Badge size="xs">Cached</Badge>}
            </div>
            <p className="text-[14px] leading-relaxed">{data.summary}</p>
            <div className="text-[10px] text-[var(--ink-muted)] mt-3">
              Analyzed {data.totalAnalyzed} top posts · {data.region === 'ALL' ? 'Global' : data.region}
            </div>
          </Card>

          {/* Must-Do */}
          {data.mustDo && data.mustDo.length > 0 && (
            <div className="mb-6">
              <h2 className="text-[14px] font-semibold tracking-tight mb-3 text-[var(--ink-muted)] uppercase">Weekly Must-Do</h2>
              <div className="space-y-2">
                {data.mustDo.map((m, i) => (
                  <Card key={i} padding="md">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-[14px] font-semibold flex-1">{m.headline}</h3>
                      <Badge tone={m.urgency === 'now' ? 'danger' : m.urgency === 'this-week' ? 'warn' : 'accent'} size="xs">
                        {m.urgency === 'now' ? 'NOW' : m.urgency === 'this-week' ? 'THIS WEEK' : 'WATCH'}
                      </Badge>
                    </div>
                    <p className="text-[12px] text-[var(--ink-muted)] leading-relaxed">{m.rationale}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Top attributes */}
          <div className="grid md:grid-cols-2 gap-6">
            <AttrSection title="Top shapes" items={data.topShapes} />
            <AttrSection title="Top colors" items={data.topColors} />
            <AttrSection title="Top materials" items={data.topMaterials} />
            <AttrSection title="Top styles" items={data.topStyles} />
          </div>
        </>
      )}
    </div>
  );
}

function AttrSection({ title, items }: { title: string; items: RankedAttr[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Card padding="md">
      <h3 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-muted)] mb-3">{title}</h3>
      <div className="space-y-2">
        {items.slice(0, 6).map((a, i) => (
          <div key={a.value} className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--ink-soft)] w-4">#{i + 1}</span>
            <span className="text-[13px] font-semibold capitalize flex-1">{a.value}</span>
            <span className="text-[11px] font-mono text-[var(--ink-muted)]">{a.count}</span>
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded',
              a.deltaPct > 0 ? 'bg-[var(--success-soft)] text-[var(--success)]' : a.deltaPct < 0 ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--surface-2)] text-[var(--ink-muted)]',
            )}>
              {a.deltaPct > 0 ? '+' : ''}{a.deltaPct}%
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
