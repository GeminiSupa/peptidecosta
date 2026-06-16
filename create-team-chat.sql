-- =========================================================================
--                     PEPTIDES COSTA RICA - TEAM CHAT
-- =========================================================================
-- Run this SQL script in your Supabase Project SQL Editor to prepare the 
-- team_messages table and set up Row Level Security (RLS) policies.

CREATE TABLE IF NOT EXISTS public.team_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_email TEXT NOT NULL,
    sender_name TEXT,
    message_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to allow safe re-runs
DROP POLICY IF EXISTS "Allow authenticated insert to team_messages" ON public.team_messages;
DROP POLICY IF EXISTS "Allow authenticated read to team_messages" ON public.team_messages;
DROP POLICY IF EXISTS "Allow authenticated delete to team_messages" ON public.team_messages;

-- Authenticated policies: Only logged-in admin users can chat
CREATE POLICY "Allow authenticated insert to team_messages" 
ON public.team_messages FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Allow authenticated read to team_messages" 
ON public.team_messages FOR SELECT 
TO authenticated 
USING (true);

-- Optional: If you want admins to be able to delete messages
CREATE POLICY "Allow authenticated delete to team_messages" 
ON public.team_messages FOR DELETE 
TO authenticated 
USING (true);

-- Enable Realtime for this table
-- (Note: you may also need to manually enable realtime for this table in the Supabase Dashboard
-- under Database > Replication > Source -> 0 tables -> toggle team_messages)
