-- Add customer identification type and number to public.orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id_number TEXT;
