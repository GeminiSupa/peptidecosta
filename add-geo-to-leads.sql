-- Alter catalog_leads table to add geographical and referral/UTM source tracking
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100);
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100);
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100);
