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

-- Fix permissions for the API
GRANT ALL ON TABLE public.abandoned_carts TO anon, authenticated, service_role;
