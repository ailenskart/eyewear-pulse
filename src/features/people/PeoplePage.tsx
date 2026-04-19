'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';

interface Person {
  id: number;
  name: string;
  title: string | null;
  department: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  location: string | null;
  company_current: string | null;
  brand_ids: number[];
  brand_handles: string[];
  source: string;
}

export function PeoplePage() {
  const router = useRouter();
  const [data, setData] = React.useState<{ people: Person[]; total: number; totalPages: number; facets?: { departments: Array<{ name: string; count: number }>; seniorities: Array<{ name: string; count: number }> } } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [dept, setDept] = React.useState('');
  const [seniority, setSeniority] = React.useState('');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: '60' });
    if (search) p.set('search', search);
    if (dept) p.set('department', dept);
    if (seniority) p.set('seniority', seniority);
    fetch(`/api/people?${p}`).then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, [page, search, dept, seniority]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">People</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            {data ? `${data.total.toLocaleString()} industry people mapped` : 'Loading…'}
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <Input
          icon={<svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>}
          placeholder="Search name, title, company…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[240px]"
        />
        <Select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}>
          <option value="">All departments</option>
          {data?.facets?.departments?.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.count})</option>)}
        </Select>
        <Select value={seniority} onChange={(e) => { setSeniority(e.target.value); setPage(1); }}>
          <option value="">All seniorities</option>
          {data?.facets?.seniorities?.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
        </Select>
      </div>

      {loading && !data && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24" />)}</div>}

      {data && data.people.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.people.map(p => (
            <Card key={p.id} padding="md" variant="interactive">
              <div className="flex items-start gap-3">
                {p.photo_url ? (
                  <img src={p.photo_url} alt="" className="w-12 h-12 rounded-full object-cover bg-[var(--surface-2)] flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-[14px] font-bold flex-shrink-0">{p.name.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13px] font-semibold truncate">{p.name}</span>
                    {p.seniority && <Badge size="xs" tone="accent">{p.seniority}</Badge>}
                  </div>
                  {p.title && <div className="text-[12px] text-[var(--ink-muted)] truncate">{p.title}</div>}
                  {p.company_current && <div className="text-[11px] text-[var(--ink-soft)] truncate">at {p.company_current}</div>}

                  {p.brand_ids && p.brand_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.brand_ids.slice(0, 5).map((id, i) => (
                        <button
                          key={id}
                          onClick={(e) => { e.stopPropagation(); router.push(`/brands/${id}`); }}
                          className="text-[9px] font-mono px-1.5 py-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded"
                        >
                          #{id}{p.brand_handles[i] ? ` ${p.brand_handles[i]}` : ''}
                        </button>
                      ))}
                      {p.brand_ids.length > 5 && (
                        <span className="text-[9px] text-[var(--ink-muted)]">+{p.brand_ids.length - 5}</span>
                      )}
                    </div>
                  )}

                  {p.linkedin_url && (
                    <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--accent)] hover:underline mt-1.5 inline-block">LinkedIn →</a>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

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
