import { Shell } from '@/components/layout/Shell';
import { ReviewQueuePage } from '@/features/admin-review/ReviewQueuePage';

export default function Page() {
  return <Shell><ReviewQueuePage /></Shell>;
}

export const dynamic = 'force-dynamic';
