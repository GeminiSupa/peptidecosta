-- Create newsletter_subscribers table
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    source TEXT DEFAULT 'website',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Allow anon inserts
DROP POLICY IF EXISTS "Allow anon insert to newsletter" ON public.newsletter_subscribers;
CREATE POLICY "Allow anon insert to newsletter" 
ON public.newsletter_subscribers FOR INSERT 
WITH CHECK (true);

-- Allow authenticated reads
DROP POLICY IF EXISTS "Allow authenticated read to newsletter" ON public.newsletter_subscribers;
CREATE POLICY "Allow authenticated read to newsletter" 
ON public.newsletter_subscribers FOR SELECT 
TO authenticated 
USING (true);
