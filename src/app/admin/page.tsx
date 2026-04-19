import { Shell } from '@/components/layout/Shell';
import { AdminPage } from '@/features/admin/AdminPage';

export default function Page() {
  return <Shell><AdminPage /></Shell>;
}

export const dynamic = 'force-dynamic';
