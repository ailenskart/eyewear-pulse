import { Shell } from '@/components/layout/Shell';
import { ContentPage } from '@/features/search/ContentPage';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Shell>
      <Suspense fallback={<div className="p-6 text-[var(--ink-muted)]">Loading…</div>}>
        <ContentPage />
      </Suspense>
    </Shell>
  );
}

export const dynamic = 'force-dynamic';
