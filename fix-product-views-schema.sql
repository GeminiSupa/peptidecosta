-- Alter the existing product_views table to support Leads behavioral tracking
ALTER TABLE public.product_views
ADD COLUMN IF NOT EXISTS contact_value VARCHAR(255),
ADD COLUMN IF NOT EXISTS product_id TEXT;

-- Make session_id optional to prevent NOT NULL errors if it's missing
ALTER TABLE public.product_views
ALTER COLUMN session_id DROP NOT NULL;
