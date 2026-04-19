export interface Brand {
  id: number;
  handle: string;
  name: string;
  description: string | null;
  category: string | null;
  region: string | null;
  country: string | null;
  iso_code: string | null;
  hq_city: string | null;
  founded_year: number | null;
  business_type: string | null;
  business_model: string | null;
  price_range: string | null;
  subcategory: string | null;
  parent_company: string | null;
  ownership_type: string | null;
  is_public: boolean | null;
  stock_ticker: string | null;
  ceo_name: string | null;
  employee_count: number | null;
  store_count: number | null;
  revenue_estimate: number | null;
  instagram_followers: number | null;
  monthly_traffic: string | null;
  has_sitemap: boolean | null;
  is_d2c: boolean | null;
  is_manufacturer: boolean | null;
  is_luxury: boolean | null;
  is_independent: boolean | null;
  is_smart_eyewear: boolean | null;
  sustainability_focus: string | null;
  website: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  linkedin_url: string | null;
  logo_url: string | null;
  tags: string[] | null;
  completeness_pct: number | null;
  confidence_pct: number | null;
  active: boolean;
  tier: 'fast' | 'mid' | 'full';
  last_scraped_at: string | null;
}

export interface ContentRow {
  id: number;
  brand_id: number | null;
  brand_handle: string | null;
  type: string;
  parent_id: number | null;
  title: string | null;
  caption: string | null;
  description: string | null;
  url: string | null;
  image_url: string | null;
  blob_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  likes: number;
  comments: number;
  views: number;
  engagement: number | null;
  price: number | null;
  compare_price: number | null;
  currency: string | null;
  person_name: string | null;
  person_title: string | null;
  linkedin_url: string | null;
  eyewear_type: string | null;
  product_type: string | null;
  posted_at: string | null;
  detected_at: string;
  data: Record<string, unknown> | null;
  source: string | null;
}

export interface Person {
  id: number;
  name: string;
  title: string | null;
  department: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  location: string | null;
}

export interface BrandProfile {
  brand: Brand;
  counts: {
    total_content: number;
    by_type: Record<string, number>;
    posts: number;
    products: number;
    people: number;
    celeb_photos: number;
    reimagines: number;
    website_links: number;
  };
  posts: ContentRow[];
  products: ContentRow[];
  people: Person[];
  celebs: ContentRow[];
  reimagines: ContentRow[];
  competitors: Array<{ id: number; handle: string; name: string; logo_url: string | null; instagram_followers: number | null; category: string | null; region: string | null }>;
}
