-- Alter public.catalog_leads table to add tracking for the last time the lead was contacted
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ DEFAULT NULL;
