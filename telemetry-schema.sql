-- =========================================================================
--                     TELEMETRY AND VISITORS TRACKING SCHEMA
-- =========================================================================
-- Run this in your Supabase SQL Editor to support the new Analytics dashboard.
-- It establishes anonymous session logging and product detail view analytics.

-- 1. VISITOR SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.visitor_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT UNIQUE NOT NULL,
    city TEXT,
    region TEXT,
    country TEXT,
    ip_address TEXT,
    device_info TEXT,
    catalog_duration INTEGER DEFAULT 0, -- Time in seconds
    last_active TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist for safe reruns
DROP POLICY IF EXISTS "Allow public insert/update to visitor_sessions" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Allow authenticated read to visitor_sessions" ON public.visitor_sessions;

-- Policies for public visitor logging
CREATE POLICY "Allow public insert/update to visitor_sessions" 
ON public.visitor_sessions FOR ALL 
USING (true) 
WITH CHECK (true);

-- Policy for admin reading
CREATE POLICY "Allow authenticated read to visitor_sessions" 
ON public.visitor_sessions FOR SELECT 
TO authenticated 
USING (true);


-- 2. PRODUCT DETAIL VIEWS TABLE
CREATE TABLE IF NOT EXISTS public.product_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist for safe reruns
DROP POLICY IF EXISTS "Allow public insert to product_views" ON public.product_views;
DROP POLICY IF EXISTS "Allow authenticated read to product_views" ON public.product_views;

-- Policies for public product viewing events
CREATE POLICY "Allow public insert to product_views" 
ON public.product_views FOR INSERT 
WITH CHECK (true);

-- Policy for admin reading
CREATE POLICY "Allow authenticated read to product_views" 
ON public.product_views FOR SELECT 
TO authenticated 
USING (true);


-- Grant all privileges to make sure Anon API has direct insertion and update capability
GRANT ALL ON TABLE public.visitor_sessions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_views TO anon, authenticated, service_role;
