-- =========================================================================
--               PEPTIDES COSTA RICA - TEAM CHAT UPGRADE
-- =========================================================================
-- Run this in your Supabase Project SQL Editor ONCE.
-- It is safe to re-run (uses IF NOT EXISTS / OR REPLACE patterns).

-- 1. Message editing support
ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- 2. Soft-delete support
ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Reactions stored as JSONB on each message
--    Format: { "👍": ["user@a.com", "user@b.com"], "❤️": ["user@c.com"] }
ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

-- 4. Online presence table
CREATE TABLE IF NOT EXISTS public.team_presence (
  email     TEXT PRIMARY KEY,
  name      TEXT,
  last_seen TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.team_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_presence_authenticated_all" ON public.team_presence;
CREATE POLICY "team_presence_authenticated_all"
  ON public.team_presence
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Enable Realtime for team_presence too
-- (You may also need to enable this manually in Supabase Dashboard:
--  Database > Replication > Source tables > toggle team_presence)

-- Done! All columns and tables are now ready.
