-- Add read receipts to team messages
ALTER TABLE public.team_messages 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
