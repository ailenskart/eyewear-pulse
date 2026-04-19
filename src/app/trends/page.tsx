import { Shell } from '@/components/layout/Shell';
import { TrendsPage } from '@/features/trends/TrendsPage';

export default function Page() {
  return <Shell><TrendsPage /></Shell>;
}

export const dynamic = 'force-dynamic';
