-- Alter catalog_leads table to add follow-up status and admin notes tracking
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'New';
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Add constraints if desired (uncomment if you want to strictly restrict statuses at the DB level)
-- ALTER TABLE public.catalog_leads ADD CONSTRAINT check_catalog_leads_status CHECK (status IN ('New', 'Contacted', 'Converted', 'Cold'));
