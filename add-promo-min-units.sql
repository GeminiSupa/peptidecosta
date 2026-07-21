-- Lets a promo code require a minimum number of units in the cart.
--
-- Run once against the project database. Safe to re-run.
--
-- min_units  NULL or 0 means no minimum, which is how every existing code
--            behaves today, so nothing changes for codes already in use.
--
-- Counts total units across all products, not units of any single product -
-- "20 or more of any products" is the negotiated-bulk case this exists for.

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS min_units integer;

ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_min_units_check;

ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_min_units_check
  CHECK (min_units IS NULL OR min_units >= 0);
