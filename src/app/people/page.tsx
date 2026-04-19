import { Shell } from '@/components/layout/Shell';
import { PeoplePage } from '@/features/people/PeoplePage';

export default function Page() {
  return <Shell><PeoplePage /></Shell>;
}

export const dynamic = 'force-dynamic';
