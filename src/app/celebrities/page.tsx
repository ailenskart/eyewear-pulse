import { Shell } from '@/components/layout/Shell';
import { CelebritiesPage } from '@/features/celebrities/CelebritiesPage';

export default function Page() {
  return <Shell><CelebritiesPage /></Shell>;
}

export const dynamic = 'force-dynamic';
