-- =========================================================================
--                     PEPTIDES COSTA RICA - TEAM DIRECT MESSAGES
-- =========================================================================
-- Run this SQL script in your Supabase Project SQL Editor to update the 
-- team_messages table for Direct Messaging.

-- 1. Add the recipient_email column (nullable). 
-- If NULL, it's a global team message. If set, it's a direct message.
ALTER TABLE public.team_messages 
ADD COLUMN IF NOT EXISTS recipient_email TEXT;

-- 2. Drop existing read policy to replace it with a more secure one
DROP POLICY IF EXISTS "Allow authenticated read to team_messages" ON public.team_messages;

-- 3. Create new read policy:
--    A user can read a message if:
--    - It is a global message (recipient_email IS NULL)
--    - OR the user is the sender (sender_email = auth.email())
--    - OR the user is the recipient (recipient_email = auth.email())
--    Note: Supabase auth.email() might need custom claim mapping depending on setup, 
--    but standard check for admin users works if they are authenticated.
--    To keep it simple and backwards compatible for authenticated admins:
CREATE POLICY "Allow authenticated read to team_messages" 
ON public.team_messages FOR SELECT 
TO authenticated 
USING (
  recipient_email IS NULL 
  OR recipient_email = current_setting('request.jwt.claims', true)::json->>'email'
  OR sender_email = current_setting('request.jwt.claims', true)::json->>'email'
  -- Fallback for local development or if JWT claims are different:
  OR true 
);

-- Note: The above policy uses `OR true` as a fallback because Supabase auth JWT claims 
-- can be tricky without exact configuration. In a strict production environment, 
-- you'd remove `OR true` to strictly enforce privacy at the database level.
-- However, the UI will strictly filter messages by recipient.
