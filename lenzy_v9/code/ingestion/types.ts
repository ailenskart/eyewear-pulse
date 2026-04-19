/**
 * types.ts — Shared TypeScript types for the Lenzy Vision Pipeline
 *
 * Purpose: Central type definitions for Apify post shapes, Gemini Vision
 *          responses, OpenCLIP embeddings, Supabase row shapes, and
 *          pipeline-internal transfer objects.
 *
 * Env vars required: none (types only)
 * Example invocation: import { ApifyIGPost, GeminiVisionResponse } from '@/lib/vision/types'
 */

// ---------------------------------------------------------------------------
// 1. Apify — Instagram post shape (actor shu8hvrXbJbY3Eb9W output)
// ---------------------------------------------------------------------------

export interface ApifyIGPostChild {
  id?: string;
  type?: string;
  displayUrl?: string;
  videoUrl?: string;
}

export interface ApifyIGPost {
  id?: string;
  shortCode?: string;
  caption?: string;
  url?: string;
  commentsCount?: number;
  likesCount?: number;
  displayUrl?: string;
  images?: string[];
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  hashtags?: string[];
  type?: string;
  videoUrl?: string;
  inputUrl?: string;
  childPosts?: ApifyIGPostChild[];
  /** Set by our ingestion layer — Vercel Blob URL */
  blobUrl?: string;
  videoBlobUrl?: string;
  carouselSlides?: Array<{ url: string; type: string }>;
}

export interface ApifyRedditPost {
  id?: string;
  title?: string;
  url?: string;
  thumbnail?: string;
  author?: string;
  subreddit?: string;
  score?: number;
  numComments?: number;
  createdAt?: string;
  mediaUrl?: string;
  blobUrl?: string;
}

// ---------------------------------------------------------------------------
// 2. Gemini Vision — eyewear detection response
// ---------------------------------------------------------------------------

export interface EyewearBoundingBox {
  x: number;       // normalized 0.0–1.0 from left
  y: number;       // normalized 0.0–1.0 from top
  width: number;   // normalized
  height: number;  // normalized
}

export type EyewearShape =
  | 'aviator'
  | 'wayfarer'
  | 'round'
  | 'cat-eye'
  | 'square'
  | 'oversized'
  | 'shield'
  | 'sport'
  | 'geometric'
  | 'other';

export type EyewearMaterial =
  | 'acetate'
  | 'metal'
  | 'titanium'
  | 'wood'
  | 'plastic'
  | 'mixed'
  | 'unknown';

export type LensType =
  | 'tinted'
  | 'mirrored'
  | 'clear'
  | 'photochromic'
  | 'polarized'
  | 'unknown';

export interface EyewearRegion {
  bbox: EyewearBoundingBox;
  shape: EyewearShape;
  color: string;
  material: EyewearMaterial;
  lens_type: LensType;
  lens_color: string;
  confidence: number;
}

export interface FaceRegion {
  bbox: EyewearBoundingBox;
  has_eyewear: boolean;
}

export interface GeminiVisionResponse {
  eyewear_present: boolean;
  confidence: number;
  eyewear_regions: EyewearRegion[];
  face_regions: FaceRegion[];
}

// ---------------------------------------------------------------------------
// 3. OpenCLIP — Replicate model response
// ---------------------------------------------------------------------------

export interface OpenCLIPEmbeddingResult {
  embedding: number[];   // 768-dimensional vector
}

export interface ReplicateEmbeddingResponse {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: OpenCLIPEmbeddingResult[];
  error?: string;
}

// ---------------------------------------------------------------------------
// 4. Supabase — row shapes for pipeline tables
// ---------------------------------------------------------------------------

export interface DirectoryCelebrity {
  id: number;
  name: string;
  ig_handle: string;
  slug: string;
  scan_enabled: boolean;
  last_scanned_at: string | null;
  scan_frequency_hours: number;
  tier: number;
  person_type: string;
  data: Record<string, unknown>;
}

export interface BrandContentRow {
  id: number;
  brand_id: number | null;
  celebrity_id: number | null;
  type: BrandContentType;
  platform: string | null;
  post_id: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  hashtags: string[] | null;
  posted_at: string | null;
  likes_count: number | null;
  comments_count: number | null;
  source_ref: Record<string, unknown> | null;
  vision: GeminiVisionResponse | null;
  attribution: AttributionData | null;
  is_active: boolean;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type BrandContentType =
  | 'instagram_post'
  | 'tiktok'
  | 'youtube'
  | 'reddit_post'
  | 'celeb_photo'
  | 'unattributed_photo'
  | 'reimagine'
  | 'product'
  | 'news'
  | 'ad';

export interface CropQueueRow {
  id: number;
  brand_content_id: number;
  region_index: number;
  crop_url: string;
  vision_region: EyewearRegion;
  embedding_id: number | null;
  embedded_at: string | null;
  matched_at: string | null;
  error: string | null;
  created_at: string;
}

export interface CelebPhotoEmbeddingRow {
  id: number;
  crop_queue_id: number;
  brand_content_id: number;
  embedding: number[];
  model: string;
  created_at: string;
}

export interface ProductEmbeddingRow {
  id: number;
  product_id: number;
  brand_id: number;
  product_name: string;
  product_image_url: string | null;
  embedding: number[];
  model: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 5. Attribution data structure
// ---------------------------------------------------------------------------

export interface AttributionCandidate {
  rank: number;
  product_id: number;
  brand_id: number;
  product_name: string;
  similarity: number;
  product_image_url: string | null;
}

export type AttributionReviewStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'no_match';

export interface AttributionData {
  candidates: AttributionCandidate[];
  top_similarity: number;
  auto_attributed?: boolean;
  attributed_at?: string;
  review_status?: AttributionReviewStatus;
  confirmed_by?: string;
  confirmed_at?: string;
  confirmed_product_id?: number;
  confirmed_brand_id?: number;
  rejected_by?: string;
  rejected_at?: string;
  human_rejected?: boolean;
  embedding_model: string;
  gemini_eyewear_region?: EyewearRegion;
  matched_at?: string;
}

// ---------------------------------------------------------------------------
// 6. Pipeline step stats (returned by each cron route)
// ---------------------------------------------------------------------------

export interface CronStepStats {
  step: string;
  batch_size: number;
  processed: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  cost_estimate_usd?: number;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 7. Apify run options (pipeline-specific)
// ---------------------------------------------------------------------------

export interface ApifyIGInput {
  directUrls: string[];
  resultsType: 'posts' | 'details' | 'hashtag';
  resultsLimit: number;
  addParentData?: boolean;
}

export interface ApifyRedditInput {
  startUrls: Array<{ url: string }>;
  maxItems: number;
  sort?: 'new' | 'hot' | 'top';
}
