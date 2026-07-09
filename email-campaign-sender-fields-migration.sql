-- Sender identity and inbox preview fields used by Marketing Studio campaigns.
-- Safe to run multiple times.

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS from_name TEXT,
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS reply_to TEXT,
  ADD COLUMN IF NOT EXISTS preview_text TEXT;

-- Ask PostgREST/Supabase API to reload its schema cache immediately.
NOTIFY pgrst, 'reload schema';
