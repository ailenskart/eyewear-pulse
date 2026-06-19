import { Shell } from '@/components/layout/Shell';
import { ShiftsPage } from '@/features/shifts/ShiftsPage';

export default function Page() {
  return <Shell><ShiftsPage /></Shell>;
}

export const dynamic = 'force-dynamic';
