import { Shell } from '@/components/layout/Shell';
import { ReimaginePageV2 } from '@/features/reimagine/ReimaginePage';

export default function Page() {
  return <Shell><ReimaginePageV2 /></Shell>;
}

export const dynamic = 'force-dynamic';
