-- Adds admin-selectable, no-code weekly deal pricing modes. Safe to re-run.
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'shelf',
  ADD COLUMN IF NOT EXISTS min_units INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_units INTEGER;

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_pricing_mode_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_pricing_mode_check
  CHECK (pricing_mode IN ('shelf', 'bulk_threshold'));
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_unit_range_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_unit_range_check
  CHECK (min_units >= 0 AND (max_units IS NULL OR max_units >= min_units));
