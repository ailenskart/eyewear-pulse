import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://adrisbzrtlkoeqmzkbsz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkcmlzYnpydGxrb2VxbXprYnN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTQ3NzEsImV4cCI6MjA5MDQ3MDc3MX0.jvsVLmLC75RTB_ITwY_eZ9FfhKVJLZJon4Uv9_L7B14';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
