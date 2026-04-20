import { Suspense } from 'react';
import { BrandDetailClient } from '@/features/brands/BrandDetailClient';
import { Shell } from '@/components/layout/Shell';

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = parseInt(id);
  
  // Support both numeric IDs (/brands/123) and handle-based URLs (/brands/rayban)
  if (Number.isFinite(numericId) && String(numericId) === id) {
    return (
      <Shell>
        <Suspense fallback={<div className="p-6 text-[var(--ink-muted)]">Loading…</div>}>
          <BrandDetailClient brandId={numericId} />
        </Suspense>
      </Shell>
    );
  }
  
  // Handle-based lookup — pass handle as a string prop
  return (
    <Shell>
      <Suspense fallback={<div className="p-6 text-[var(--ink-muted)]">Loading…</div>}>
        <BrandDetailClient brandHandle={id} />
      </Suspense>
    </Shell>
  );
}

export const dynamic = 'force-dynamic';
