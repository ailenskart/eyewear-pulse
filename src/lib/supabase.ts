import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://adrisbzrtlkoeqmzkbsz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkcmlzYnpydGxrb2VxbXprYnN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTQ3NzEsImV4cCI6MjA5MDQ3MDc3MX0.jvsVLmLC75RTB_ITwY_eZ9FfhKVJLZJon4Uv9_L7B14';

// Anon client — used on the server for reads. RLS is disabled on the
// tables we write to (ig_posts, celeb_photos, feed_cron_runs), so anon
// works for writes too. If the service-role key is set via env var,
// prefer it for writes (bypasses any future RLS we add).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let _serverClient: SupabaseClient | null = null;
export function supabaseServer(): SupabaseClient {
  if (_serverClient) return _serverClient;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  _serverClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serverClient;
}

