-- Add customer_name to visitor_sessions
ALTER TABLE public.visitor_sessions
  ADD COLUMN IF NOT EXISTS customer_name TEXT;
