-- Adds admin-selectable, no-code weekly deal pricing modes. Safe to re-run.
--
-- Historical deals used `percent` for the ordinary product-price markdown mode.
-- Keep that value valid instead of rewriting old deal records. The application
-- treats both `percent` and `shelf` as the same shelf-price mode; all newly
-- created deals use `shelf` or `bulk_threshold`.
--
-- The transaction is deliberate: if any statement fails, PostgreSQL rolls the
-- whole migration back. No deal, product, price, order, or banner is deleted.
BEGIN;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'shelf',
  ADD COLUMN IF NOT EXISTS min_units INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_units INTEGER;

-- IF NOT EXISTS does not change the default when pricing_mode already exists.
-- Make future direct inserts use the current name without altering stored rows.
ALTER TABLE public.deals
  ALTER COLUMN pricing_mode SET DEFAULT 'shelf';

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_pricing_mode_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_pricing_mode_check
  CHECK (pricing_mode IN ('percent', 'shelf', 'bulk_threshold'));

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_unit_range_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_unit_range_check
  CHECK (min_units >= 0 AND (max_units IS NULL OR max_units >= min_units));

COMMIT;
