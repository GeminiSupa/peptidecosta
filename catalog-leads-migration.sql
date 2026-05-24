-- Create table for storing catalog access leads
CREATE TABLE IF NOT EXISTS public.catalog_leads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    contact_method VARCHAR(50) NOT NULL, -- 'email' or 'whatsapp'
    contact_value VARCHAR(255) NOT NULL, -- The actual email address or phone number
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.catalog_leads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (so website visitors can submit the form)
CREATE POLICY "Allow anonymous inserts into catalog_leads" 
ON public.catalog_leads FOR INSERT 
TO public
WITH CHECK (true);

-- Only authenticated users (admins) can view leads
CREATE POLICY "Allow authenticated selects on catalog_leads" 
ON public.catalog_leads FOR SELECT 
TO authenticated 
USING (true);
