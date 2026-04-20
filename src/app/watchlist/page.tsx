import { Shell } from '@/components/layout/Shell';
import { WatchlistPage } from '@/features/watchlist/WatchlistPage';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Shell>
      <Suspense fallback={<div className="p-6 text-[var(--ink-muted)]">Loading…</div>}>
        <WatchlistPage />
      </Suspense>
    </Shell>
  );
}

export const dynamic = 'force-dynamic';
