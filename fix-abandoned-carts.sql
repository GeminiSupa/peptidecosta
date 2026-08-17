-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    cart_data JSONB NOT NULL,
    status TEXT DEFAULT 'active',
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions are NOT granted here anymore. This file used to end with
--   GRANT ALL ON TABLE public.abandoned_carts TO anon, authenticated, service_role;
-- which handed the anon key — published in the JS bundle — full read, write and
-- delete over every shopper's contact details, IP, geolocation and cart.
-- lock-abandoned-carts-rls.sql now owns the grants; the storefront reaches this
-- table only through /api/cart/track on the service role.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.abandoned_carts TO service_role;
