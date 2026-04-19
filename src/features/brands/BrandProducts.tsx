'use client';

import * as React from 'react';
import { MediaCard } from '@/components/ui/MediaCard';
import { EmptyState } from '@/components/ui/Skeleton';
import type { ContentRow } from './types';

function priceString(p: ContentRow): string {
  if (!p.price) return '';
  const sym = p.currency === 'EUR' ? '€' : p.currency === 'GBP' ? '£' : p.currency === 'INR' ? '₹' : '$';
  return sym + Number(p.price).toLocaleString();
}

export function BrandProducts({ items }: { items: ContentRow[] }) {
  if (items.length === 0) {
    return <div className="max-w-6xl mx-auto px-4 py-8">
      <EmptyState
        title="No products scraped yet"
        description="Sitemap parse or Shopify scraper hasn't run for this brand."
      />
    </div>;
  }
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {items.map(p => (
          <MediaCard
            key={p.id}
            image={p.blob_url || p.image_url || ''}
            aspect="square"
            title={p.title}
            subtitle={[priceString(p), p.product_type].filter(Boolean).join(' · ')}
            href={p.url || undefined}
          />
        ))}
      </div>
    </div>
  );
}
