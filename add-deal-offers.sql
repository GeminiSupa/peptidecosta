-- Two-offer Deal of the Week ("Mix & Match" + "Buy X, Get Y Free").
--
-- Run in the Supabase SQL editor BEFORE deploying the code that uses it.
-- Safe to run more than once. Existing deals are untouched: they keep their
-- pricing_mode and simply have no offers.
--
-- offers holds both offers' settings, for example:
--   { "mix":    { "enabled": true, "product_names": [...], "min_units": 2, "discount_pct": 0.10 },
--     "bundle": { "enabled": true, "product_names": [...], "buy_qty": 4, "free_qty": 1 } }

BEGIN;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS offers JSONB;

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_pricing_mode_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_pricing_mode_check
  CHECK (pricing_mode IN ('percent', 'shelf', 'bulk_threshold', 'offers'));

COMMIT;

-- PostgREST caches the table shape; this makes the new column usable at once.
NOTIFY pgrst, 'reload schema';
