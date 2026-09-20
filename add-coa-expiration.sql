-- =========================================================================
-- COA EXPIRATION TRACKING & LOT MIGRATION
-- =========================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS coa_expiry_date TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS coa_lot_number TEXT;
