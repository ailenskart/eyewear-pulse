import { Shell } from '@/components/layout/Shell';
import { BrandDirectory } from '@/features/brands/BrandDirectory';

export default function BrandsPage() {
  return <Shell><BrandDirectory /></Shell>;
}

export const dynamic = 'force-dynamic';
