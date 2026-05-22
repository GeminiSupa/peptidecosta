-- =========================================================================
--                     PEPTIDES COSTA RICA - DATABASE SCHEMA
-- =========================================================================
-- 
-- Run this SQL script in your Supabase Project SQL Editor to prepare your tables
-- and set up Row Level Security (RLS) policies.

-- 1. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product TEXT NOT NULL,
    category TEXT NOT NULL,
    price_usd TEXT NOT NULL,
    price_crc TEXT,
    original_price_usd TEXT,
    original_price_crc TEXT,
    discount TEXT,
    status TEXT NOT NULL DEFAULT 'In Stock',
    coa TEXT,
    image_url TEXT,
    emoji TEXT,
    description_en TEXT,
    description_es TEXT,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) for public.products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to allow safe re-runs
DROP POLICY IF EXISTS "Allow public read access to products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated insert to products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated update to products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated delete to products" ON public.products;

-- Select policy: Anyone (public) can view products in the catalog
CREATE POLICY "Allow public read access to products" 
ON public.products FOR SELECT 
USING (true);

-- Authenticated policies: Only logged-in admin users can modify products
CREATE POLICY "Allow authenticated insert to products" 
ON public.products FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Allow authenticated update to products" 
ON public.products FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow authenticated delete to products" 
ON public.products FOR DELETE 
TO authenticated 
USING (true);


-- 2. ORDERS LOG LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    items JSONB NOT NULL, -- Format: [{ "product": "Retatrutide 10mg", "qty": 1, "price": 125 }]
    total_usd NUMERIC,
    total_crc NUMERIC,
    currency TEXT NOT NULL DEFAULT 'CRC',
    payment_method TEXT NOT NULL DEFAULT 'whatsapp',
    shipping_address TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) for public.orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to allow safe re-runs
DROP POLICY IF EXISTS "Allow public insert access to orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated read access to orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated update access to orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated delete access to orders" ON public.orders;

-- Insert policy: Anyone can place a new order from the checkout screen
CREATE POLICY "Allow public insert access to orders" 
ON public.orders FOR INSERT 
WITH CHECK (true);

-- Authenticated policies: Only logged-in admins can view or update customer orders
CREATE POLICY "Allow authenticated read access to orders" 
ON public.orders FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated update access to orders" 
ON public.orders FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow authenticated delete access to orders" 
ON public.orders FOR DELETE 
TO authenticated 
USING (true);


-- 3. INITIALIZE ADMIN USER IN SUPABASE AUTH (Optional / Reference)
-- In Supabase, users are created via the Auth UI or Auth APIs.
-- To register the admin user directly via SQL in your Supabase Auth engine:
--
-- INSERT INTO auth.users (
--     instance_id, id, aud, role, email, encrypted_password, 
--     email_confirmed_at, recovery_sent_at, last_sign_in_at, 
--     raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
--     confirmation_token, email_change, email_change_token_new, email_change_confirm_status
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000000',
--     gen_random_uuid(),
--     'authenticated',
--     'authenticated',
--     'admin@costapeptides.com',
--     crypt('CostaPeptides2026!', gen_salt('bf')),
--     now(),
--     NULL,
--     NULL,
--     '{"provider": "email", "providers": ["email"]}',
--     '{}',
--     now(),
--     now(),
--     '',
--     '',
--     '',
--     0
-- ) ON CONFLICT (email) DO NOTHING;


-- =========================================================================
-- 4. SUPABASE STORAGE BUCKET: product-pics
-- =========================================================================
-- Creates the public storage bucket for product photos and sets up security policies.

-- Insert the public bucket if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-pics', 'product-pics', true)
ON CONFLICT (id) DO NOTHING;



-- Select policy: Anyone (public) can read/download images from product-pics
DROP POLICY IF EXISTS "Public Read Product Pics" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload Product Pics" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update Product Pics" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Product Pics" ON storage.objects;

CREATE POLICY "Public Read Product Pics" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'product-pics');

-- Write policies: Only authenticated users (admins) can upload, modify, or delete pics
CREATE POLICY "Admin Upload Product Pics" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'product-pics');

CREATE POLICY "Admin Update Product Pics" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id = 'product-pics')
WITH CHECK (bucket_id = 'product-pics');

CREATE POLICY "Admin Delete Product Pics" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'product-pics');


-- =========================================================================
-- 5. PRODUCT REVIEWS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) for public.product_reviews
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to allow safe re-runs
DROP POLICY IF EXISTS "Allow public insert access to reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Allow public read access to approved reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Allow authenticated read access to all reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Allow authenticated update access to reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Allow authenticated delete access to reviews" ON public.product_reviews;

-- Insert policy: Anyone can submit a review
CREATE POLICY "Allow public insert access to reviews" 
ON public.product_reviews FOR INSERT 
WITH CHECK (true);

-- Select policy: Public can only see Approved reviews
CREATE POLICY "Allow public read access to approved reviews" 
ON public.product_reviews FOR SELECT 
USING (status = 'Approved');

-- Authenticated policies: Logged-in admins can view, update (approve), or delete all reviews
CREATE POLICY "Allow authenticated read access to all reviews" 
ON public.product_reviews FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated update access to reviews" 
ON public.product_reviews FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow authenticated delete access to reviews" 
ON public.product_reviews FOR DELETE 
TO authenticated 
USING (true);


-- =========================================================================
-- RUN THIS IF YOU ALREADY CREATED THE PRODUCTS TABLE
-- =========================================================================
-- ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description_en TEXT;
-- ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description_es TEXT;

-- 2. Added Payment Methods & Shipping (Added May 20)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;


-- Add tracking_number for old order tracking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- 3. Added Sale Prices (Added May)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_price_usd TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_price_crc TEXT;
