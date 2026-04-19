import { Suspense } from 'react';
import { BrandDetailClient } from '@/features/brands/BrandDetailClient';
import { Shell } from '@/components/layout/Shell';

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = parseInt(id);
  if (!Number.isFinite(numericId)) {
    return <Shell><div className="max-w-6xl mx-auto px-4 py-12 text-[13px] text-[var(--ink-muted)]">Invalid brand ID.</div></Shell>;
  }
  return (
    <Shell>
      <Suspense fallback={<div className="p-6 text-[var(--ink-muted)]">Loading…</div>}>
        <BrandDetailClient brandId={numericId} />
      </Suspense>
    </Shell>
  );
}

export const dynamic = 'force-dynamic';
