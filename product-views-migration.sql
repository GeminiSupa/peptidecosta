-- Create table for storing product view events
CREATE TABLE IF NOT EXISTS public.product_views (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    contact_value VARCHAR(255) NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (so website visitors can log views)
CREATE POLICY "Allow anonymous inserts into product_views" 
ON public.product_views FOR INSERT 
TO public
WITH CHECK (true);

-- Only authenticated users (admins) can view the logs
CREATE POLICY "Allow authenticated selects on product_views" 
ON public.product_views FOR SELECT 
TO authenticated 
USING (true);
