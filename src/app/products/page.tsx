import { Shell } from '@/components/layout/Shell';
import { ProductsPage } from '@/features/products/ProductsPage';

export default function Page() {
  return <Shell><ProductsPage /></Shell>;
}

export const dynamic = 'force-dynamic';
