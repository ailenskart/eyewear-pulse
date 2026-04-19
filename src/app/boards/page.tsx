import { Shell } from '@/components/layout/Shell';
import { BoardsPage } from '@/features/boards/BoardsPage';

export default function Page() {
  return <Shell><BoardsPage /></Shell>;
}

export const dynamic = 'force-dynamic';
