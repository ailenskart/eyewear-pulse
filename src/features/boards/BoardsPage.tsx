'use client';

import * as React from 'react';
import { Card, CardTitle, CardSubtitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

interface Board {
  id: string;
  name: string;
  description: string;
  cover?: string;
  items: Array<{ id: string; image: string; title?: string; url?: string }>;
  is_shared: boolean;
  created_at: string;
}

function loadBoards(): Board[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('lenzy:boards:v2') : null;
    if (!raw) return [];
    return JSON.parse(raw) as Board[];
  } catch { return []; }
}
function saveBoards(bs: Board[]) {
  localStorage.setItem('lenzy:boards:v2', JSON.stringify(bs));
}

export function BoardsPage() {
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [creatingOpen, setCreatingOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newDesc, setNewDesc] = React.useState('');

  React.useEffect(() => {
    setBoards(loadBoards());
  }, []);

  const createBoard = () => {
    if (!newName.trim()) return;
    const b: Board = {
      id: 'b_' + Math.random().toString(36).slice(2, 10),
      name: newName.trim(),
      description: newDesc.trim(),
      items: [],
      is_shared: false,
      created_at: new Date().toISOString(),
    };
    const next = [b, ...boards];
    setBoards(next); saveBoards(next);
    setCreatingOpen(false); setNewName(''); setNewDesc('');
  };

  const deleteBoard = (id: string) => {
    if (!confirm('Delete board?')) return;
    const next = boards.filter(b => b.id !== id);
    setBoards(next); saveBoards(next);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Boards</h1>
          <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
            Pin anything — posts, products, people, celebs, reimagines — into swipe files.
          </p>
        </div>
        <Button size="md" onClick={() => setCreatingOpen(true)}>+ New board</Button>
      </div>

      {boards.length === 0 && (
        <EmptyState
          title="No boards yet"
          description="Create a board to start collecting inspiration. Pin any post, product, or person — everything can live on a board together."
          action={<Button onClick={() => setCreatingOpen(true)}>Create your first board</Button>}
        />
      )}

      {boards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map(b => (
            <Card key={b.id} variant="interactive" padding="none">
              <div className="aspect-video bg-[var(--surface-2)] grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5 overflow-hidden">
                {b.items.length > 0 ? (
                  b.items.slice(0, 4).map((it, i) => (
                    <img key={i} src={it.image} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ))
                ) : (
                  <div className="col-span-2 row-span-2 flex items-center justify-center text-[var(--ink-soft)] text-[11px]">Empty board</div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{b.name}</CardTitle>
                    {b.description && <CardSubtitle className="truncate">{b.description}</CardSubtitle>}
                  </div>
                  {b.is_shared ? <Badge tone="success" size="xs">Shared</Badge> : <Badge size="xs">Private</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-[var(--ink-muted)]">
                  <span>{b.items.length} items</span>
                  <button onClick={() => deleteBoard(b.id)} className="ml-auto text-[var(--danger)] hover:underline">Delete</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creatingOpen} onClose={() => setCreatingOpen(false)} maxWidth="max-w-md">
        <DialogHeader title="Create board" onClose={() => setCreatingOpen(false)} />
        <DialogBody>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-1">Name</div>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Summer 2026 inspiration" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-1">Description</div>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Amber acetate, cat-eye, sunset palette" />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setCreatingOpen(false)}>Cancel</Button>
          <Button onClick={createBoard} disabled={!newName.trim()}>Create</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
