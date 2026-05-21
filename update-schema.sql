-- Add new customer metadata columns to orders and abandoned_carts

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS customer_email TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS location_data JSONB,
ADD COLUMN IF NOT EXISTS device_info TEXT;

ALTER TABLE public.abandoned_carts 
ADD COLUMN IF NOT EXISTS customer_email TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS location_data JSONB,
ADD COLUMN IF NOT EXISTS device_info TEXT;
