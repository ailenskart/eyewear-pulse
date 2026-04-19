'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Brand } from './types';

function formatNum(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export function BrandHeader({ brand, onEdit, onScan }: {
  brand: Brand;
  onEdit?: () => void;
  onScan?: () => void;
}) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="max-w-6xl mx-auto px-4 py-5">
        <div className="flex items-start gap-4">
          {/* Logo or initial */}
          {brand.logo_url ? (
            <img
              src={brand.logo_url}
              alt={brand.name}
              className="w-16 h-16 rounded-[var(--radius-lg)] object-cover bg-[var(--surface-2)] flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-16 h-16 rounded-[var(--radius-lg)] bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-[22px] font-bold flex-shrink-0">
              {brand.name.charAt(0)}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge tone="accent" size="md">#{brand.id}</Badge>
              <h1 className="text-[22px] font-semibold tracking-tight">{brand.name}</h1>
              {brand.instagram_url && (
                <a
                  href={brand.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--accent)]"
                >
                  @{brand.handle}
                </a>
              )}
            </div>

            {/* Category / region / country badges */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {brand.category && <Badge>{brand.category}</Badge>}
              {brand.region && <Badge>{brand.region}</Badge>}
              {brand.country && <Badge>{brand.country}{brand.iso_code ? ` · ${brand.iso_code}` : ''}</Badge>}
              {brand.is_public && brand.stock_ticker && <Badge tone="accent">{brand.stock_ticker}</Badge>}
              {brand.is_luxury && <Badge tone="warn">Luxury</Badge>}
              {brand.is_d2c && <Badge tone="success">D2C</Badge>}
              {brand.is_smart_eyewear && <Badge tone="accent">Smart</Badge>}
            </div>

            {brand.description && (
              <p className="text-[13px] text-[var(--ink-muted)] leading-relaxed max-w-3xl mb-3">{brand.description}</p>
            )}

            {/* Quick stats */}
            <div className="flex flex-wrap gap-5 text-[12px]">
              <Stat label="Followers" value={formatNum(brand.instagram_followers)} />
              <Stat label="Employees" value={formatNum(brand.employee_count)} />
              <Stat label="Stores" value={formatNum(brand.store_count)} />
              <Stat label="Founded" value={brand.founded_year?.toString() || '—'} />
              {brand.revenue_estimate && <Stat label="Revenue" value={'$' + formatNum(brand.revenue_estimate)} />}
              {brand.parent_company && <Stat label="Parent" value={brand.parent_company} />}
              {brand.ceo_name && <Stat label="CEO" value={brand.ceo_name} />}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            {onEdit && <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button>}
            {onScan && <Button size="sm" variant="ghost" onClick={onScan}>Scan</Button>}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { window.location.href = `/api/brands/export?brand_id=${brand.id}&format=csv`; }}
            >Export</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">{label}</div>
      <div className="text-[13px] font-semibold text-[var(--ink)] mt-0.5">{value}</div>
    </div>
  );
}
