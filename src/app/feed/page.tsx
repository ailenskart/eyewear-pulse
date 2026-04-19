import { Shell } from '@/components/layout/Shell';
import { FeedPage } from '@/features/feed/FeedPage';

export default function Page() {
  return <Shell><FeedPage /></Shell>;
}

export const dynamic = 'force-dynamic';
