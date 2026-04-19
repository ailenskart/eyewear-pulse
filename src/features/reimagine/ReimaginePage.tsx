'use client';

import * as React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Skeleton';

interface Generated {
  url: string;
  blobUrl?: string | null;
  contentId?: number | null;
  model: string;
  type: string;
}

export function ReimaginePageV2() {
  const [sourceUrl, setSourceUrl] = React.useState('');
  const [prompt, setPrompt] = React.useState('');
  const [brand, setBrand] = React.useState('Lenskart');
  const [generating, setGenerating] = React.useState(false);
  const [results, setResults] = React.useState<{ generatedImages: Generated[]; creativeBrief?: string; originalAnalysis?: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    if (!sourceUrl.trim()) { setError('Paste a source image URL first.'); return; }
    setGenerating(true); setError(null); setResults(null);
    try {
      const res = await fetch('/api/reimagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: sourceUrl, prompt, brandName: brand }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
    setGenerating(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Reimagine Studio</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            Remix any post as a Lenskart-branded creative. FLUX Kontext + Blob-persisted outputs.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-5">
        {/* Source / controls */}
        <div className="space-y-3">
          <Card padding="md">
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-muted)] mb-2">Source image</h3>
            <Input
              placeholder="https://..."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="mb-2"
            />
            {sourceUrl && (
              <img
                src={sourceUrl}
                alt=""
                className="w-full aspect-square object-cover rounded-[var(--radius)] bg-[var(--surface-2)]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </Card>

          <Card padding="md">
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-muted)] mb-2">Brand kit</h3>
            <div className="flex flex-wrap gap-1.5">
              {['Lenskart', 'John Jacobs', 'Vincent Chase', 'B by Lenskart'].map(b => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={`px-2.5 h-8 rounded-full text-[11px] font-semibold transition-colors ${
                    brand === b ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >{b}</button>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-muted)] mb-2">Prompt (optional)</h3>
            <Textarea
              placeholder="Any additional direction — e.g. 'target Indian audience, sunset mood'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
            <Button full variant="primary" loading={generating} onClick={run} className="mt-2">
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </Card>
        </div>

        {/* Results */}
        <div>
          {!results && !generating && !error && (
            <EmptyState
              title="Paste a source image URL and hit Generate"
              description="Pick any post from Feed or Brand detail, copy the image URL, and we'll remix it with your brand kit applied."
            />
          )}
          {generating && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2].map(i => (
                <Card key={i} padding="none">
                  <div className="aspect-square bg-[var(--surface-2)] flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  </div>
                </Card>
              ))}
            </div>
          )}
          {error && (
            <Card padding="md" className="border-[var(--danger)]">
              <div className="text-[13px] text-[var(--danger)]">{error}</div>
            </Card>
          )}
          {results && (
            <div className="space-y-4">
              {results.creativeBrief && (
                <Card padding="md">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-muted)] mb-1">Creative brief</div>
                  <p className="text-[12px] leading-relaxed">{results.creativeBrief}</p>
                </Card>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.generatedImages.map((g, i) => (
                  <Card key={i} padding="none" variant="photographic">
                    <img
                      src={g.blobUrl || g.url}
                      alt={g.model}
                      className="w-full aspect-square object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <Badge tone="accent" size="xs">{g.model}</Badge>
                        {g.blobUrl && <Badge size="xs" tone="success">Saved</Badge>}
                      </div>
                      <a href={g.blobUrl || g.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--accent)] font-semibold hover:underline">
                        Open →
                      </a>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
