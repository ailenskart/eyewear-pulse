'use client';

import * as React from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { EmptyState } from '@/components/ui/Skeleton';
import type { ContentRow } from './types';

function proxyImg(url: string | null | undefined): string {
  if (!url) return '';
  if (url.includes('cdninstagram.com')) return `/api/img?url=${encodeURIComponent(url)}`;
  return url;
}

function formatNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export function BrandPosts({ items }: { items: ContentRow[] }) {
  if (items.length === 0) {
    return <div className="max-w-6xl mx-auto px-4 py-8">
      <EmptyState
        title="No posts scraped yet"
        description="The Instagram cron will pick this brand up on its next scheduled run."
      />
    </div>;
  }
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(p => (
          <MediaCard
            key={p.id}
            image={proxyImg(p.blob_url || p.image_url)}
            aspect="square"
            href={p.url || undefined}
            overlayBottom={
              <div className="flex items-center justify-between">
                <span className="text-[10px] opacity-90">{(p.caption || '').slice(0, 50)}</span>
                {p.likes > 0 && <span className="text-[10px] font-semibold">♥ {formatNum(p.likes)}</span>}
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}
