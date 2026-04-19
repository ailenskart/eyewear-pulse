'use client';

import * as React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';

interface ReviewItem {
  id: number;
  brand_id: number | null;
  brand_handle: string | null;
  type: string;
  image_url: string | null;
  caption: string | null;
  person_name: string | null;
  data: { attribution_confidence?: number; top_matches?: Array<{ brand_id: number; similarity: number; title: string }> } | null;
  detected_at: string;
}

interface Data {
  items: ReviewItem[];
  total: number;
  page: number;
  totalPages: number;
}

export function ReviewQueuePage() {
  const [data, setData] = React.useState<Data | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [busy, setBusy] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/review-queue?page=${page}&limit=25`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [page]);

  React.useEffect(() => { load(); }, [load]);

  const decide = async (id: number, action: 'approve' | 'reject', brand_id?: number) => {
    setBusy(id);
    await fetch('/api/v1/review-queue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content_id: id, action, brand_id }),
    });
    setBusy(null);
    load();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Review queue</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            {data ? `${data.total.toLocaleString()} low-confidence attributions awaiting review` : 'Loading…'}
          </p>
        </div>
      </div>

      {loading && !data && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}</div>}
      {data && data.items.length === 0 && <EmptyState title="Queue clear" description="No low-confidence matches to review." />}

      <div className="space-y-3">
        {data?.items.map(it => {
          const conf = it.data?.attribution_confidence ?? 0;
          const top = it.data?.top_matches || [];
          return (
            <Card key={it.id} padding="sm">
              <div className="flex gap-4">
                {it.image_url && (
                  <img src={it.image_url} alt="" className="w-32 h-32 object-cover rounded-md bg-[var(--surface-2)]" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge tone="warn" size="xs">{Math.round(conf * 100)}% match</Badge>
                    {it.person_name && <span className="text-[12px] font-semibold">{it.person_name}</span>}
                  </div>
                  {it.caption && <p className="text-[12px] text-[var(--ink-muted)] truncate mb-2">{it.caption}</p>}
                  {top.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {top.slice(0, 3).map((m, i) => (
                        <button
                          key={i}
                          onClick={() => decide(it.id, 'approve', m.brand_id)}
                          disabled={busy === it.id}
                          className="text-[11px] px-2 py-1 rounded-md bg-[var(--surface-2)] hover:bg-[var(--border)] transition-colors">
                          #{m.brand_id} · {m.title.slice(0, 40)} · {Math.round(m.similarity * 100)}%
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => decide(it.id, 'approve')} disabled={busy === it.id}>
                      Approve as-is
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => decide(it.id, 'reject')} disabled={busy === it.id}>
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <Button size="sm" variant="secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <span className="text-[11px] text-[var(--ink-muted)] font-mono">Page {page} / {data.totalPages}</span>
          <Button size="sm" variant="secondary" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>Next</Button>
        </div>
      )}
    </div>
  );
}
