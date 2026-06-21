-- =========================================================================
--               PEPTIDES COSTA RICA - SCHEDULED BROADCASTS
-- =========================================================================
-- Run this script in your Supabase SQL Editor to add the scheduled broadcasts queue.

CREATE TABLE IF NOT EXISTS public.scheduled_broadcasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audience TEXT NOT NULL,
  custom_contacts TEXT,
  channels JSONB NOT NULL,
  message TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.scheduled_broadcasts ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Enable all access for service role on scheduled_broadcasts" 
ON public.scheduled_broadcasts 
FOR ALL USING (true);
