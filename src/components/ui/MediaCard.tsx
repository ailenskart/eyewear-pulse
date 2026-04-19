'use client';

import * as React from 'react';
import { cn } from './cn';

export interface MediaCardProps {
  image: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  overlayTop?: React.ReactNode;
  overlayBottom?: React.ReactNode;
  aspect?: 'square' | 'portrait' | 'video';
  onClick?: () => void;
  href?: string;
  className?: string;
}

const ASPECT = {
  square:   'aspect-square',
  portrait: 'aspect-[4/5]',
  video:    'aspect-video',
} as const;

export function MediaCard({ image, title, subtitle, overlayTop, overlayBottom, aspect = 'square', onClick, href, className }: MediaCardProps) {
  const [err, setErr] = React.useState(false);
  const body = (
    <>
      <div className={cn('relative overflow-hidden bg-[var(--surface-2)]', ASPECT[aspect])}>
        {!err ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            onError={() => setErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl text-[var(--ink-soft)]">👓</div>
        )}
        {overlayTop && (
          <div className="absolute top-2 right-2 flex items-center gap-1">{overlayTop}</div>
        )}
        {overlayBottom && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-1.5 text-white text-[11px]">
            {overlayBottom}
          </div>
        )}
      </div>
      {(title || subtitle) && (
        <div className="p-2.5">
          {title && <div className="text-[12px] font-semibold line-clamp-1">{title}</div>}
          {subtitle && <div className="text-[10px] text-[var(--ink-muted)] mt-0.5 line-clamp-1">{subtitle}</div>}
        </div>
      )}
    </>
  );

  const baseClass = cn(
    'group block bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden',
    'transition-all hover:border-[var(--accent)] hover:shadow-[var(--shadow)]',
    onClick || href ? 'cursor-pointer' : '',
    className,
  );

  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={baseClass}>{body}</a>;
  return <div className={baseClass} onClick={onClick} role={onClick ? 'button' : undefined}>{body}</div>;
}
