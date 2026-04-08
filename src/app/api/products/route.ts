import { NextRequest, NextResponse } from 'next/server';
import productsData from '@/data/products.json';

interface Product {
  brand: string;
  name: string;
  price: string;
  currency: string;
  image: string;
  type: string;
  url: string;
  tags: string[];
  description: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sortBy') || 'price_asc';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '40');

  let filtered = (productsData as Product[]).filter(p => p.name && p.price);

  if (brand && brand !== 'All') {
    filtered = filtered.filter(p => p.brand === brand);
  }
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(s) ||
      p.brand.toLowerCase().includes(s) ||
      p.type.toLowerCase().includes(s) ||
      p.tags.some(t => t.toLowerCase().includes(s))
    );
  }

  // Parse price for sorting
  const parsePrice = (p: string) => {
    const match = p.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  };

  switch (sortBy) {
    case 'price_asc':
      filtered.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
      break;
    case 'price_desc':
      filtered.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
      break;
    case 'brand':
      filtered.sort((a, b) => a.brand.localeCompare(b.brand));
      break;
    case 'name':
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  const products = filtered.slice(start, start + limit);

  // Analytics
  const brands = [...new Set((productsData as Product[]).map(p => p.brand))].sort();
  const priceRanges = { under25: 0, '25to50': 0, '50to100': 0, '100to200': 0, over200: 0 };
  (productsData as Product[]).forEach(p => {
    const price = parsePrice(p.price);
    if (price > 0 && price < 25) priceRanges.under25++;
    else if (price < 50) priceRanges['25to50']++;
    else if (price < 100) priceRanges['50to100']++;
    else if (price < 200) priceRanges['100to200']++;
    else priceRanges.over200++;
  });

  const avgByBrand = brands.map(b => {
    const bProducts = (productsData as Product[]).filter(p => p.brand === b && p.price);
    const prices = bProducts.map(p => parsePrice(p.price)).filter(p => p > 0);
    return {
      brand: b,
      products: bProducts.length,
      avgPrice: prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
    };
  }).sort((a, b) => a.avgPrice - b.avgPrice);

  return NextResponse.json({
    products,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    brands,
    priceRanges,
    avgByBrand,
  });
}
