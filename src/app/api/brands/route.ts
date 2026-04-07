import { NextRequest, NextResponse } from 'next/server';
import { BRANDS } from '@/lib/brands';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category');
  const region = searchParams.get('region');
  const search = searchParams.get('search');
  const priceRange = searchParams.get('priceRange');
  const subcategory = searchParams.get('subcategory');
  const sortBy = searchParams.get('sortBy') || 'followerEstimate';
  const order = searchParams.get('order') || 'desc';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  let filtered = [...BRANDS];

  if (category && category !== 'All') {
    filtered = filtered.filter(b => b.category === category);
  }
  if (region && region !== 'All') {
    filtered = filtered.filter(b => b.region === region);
  }
  if (priceRange && priceRange !== 'All') {
    filtered = filtered.filter(b => b.priceRange === priceRange);
  }
  if (subcategory && subcategory !== 'All') {
    filtered = filtered.filter(b => b.subcategory === subcategory);
  }
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(b =>
      b.name.toLowerCase().includes(s) ||
      b.handle.toLowerCase().includes(s) ||
      b.description.toLowerCase().includes(s) ||
      b.headquarters.toLowerCase().includes(s)
    );
  }

  // Sort
  const key = sortBy as keyof typeof BRANDS[0];
  filtered.sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'desc' ? bVal - aVal : aVal - bVal;
    }
    return order === 'desc'
      ? String(bVal).localeCompare(String(aVal))
      : String(aVal).localeCompare(String(bVal));
  });

  const total = filtered.length;
  const start = (page - 1) * limit;
  const paginated = filtered.slice(start, start + limit);

  // Analytics
  const categories = BRANDS.reduce((acc, b) => {
    acc[b.category] = (acc[b.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const regions = BRANDS.reduce((acc, b) => {
    acc[b.region] = (acc[b.region] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalFollowers = BRANDS.reduce((s, b) => s + b.followerEstimate, 0);
  const avgEngagement = BRANDS.length > 0
    ? BRANDS.reduce((s, b) => s + (b.followerEstimate > 0 ? b.avgLikes / b.followerEstimate : 0), 0) / BRANDS.length * 100
    : 0;

  return NextResponse.json({
    brands: paginated,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    analytics: {
      totalBrands: BRANDS.length,
      totalFollowers,
      avgEngagement: avgEngagement.toFixed(2),
      categories,
      regions,
      priceDistribution: BRANDS.reduce((acc, b) => {
        acc[b.priceRange] = (acc[b.priceRange] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
  });
}
