-- Lets a promo code cap how many units the cart may contain.
--
-- Run once against the project database. Safe to re-run.
--
-- max_units  NULL or 0 means no maximum, which is how every existing code
--            behaves today, so nothing changes for codes already in use.
--
-- The mirror of min_units. Where min_units serves negotiated bulk deals
-- ("20 or more"), this serves capped introductory offers - "15% off your
-- first order of up to 4 products" - where the discount is bait for a small
-- first purchase and must not apply to someone stocking up on thirty vials.
--
-- Counts total units across all products, matching how min_units and the
-- automatic volume discount both count.

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS max_units integer;

ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_max_units_check;

ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_max_units_check
  CHECK (max_units IS NULL OR max_units >= 0);

-- A code cannot demand both "at least 10" and "at most 4" - that is a code
-- nobody can ever use, and it would only be discovered by a customer failing
-- at checkout. Rejected at the database so no admin screen can save it.
ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_unit_range_check;

ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_unit_range_check
  CHECK (
    min_units IS NULL OR max_units IS NULL
    OR min_units = 0 OR max_units = 0
    OR max_units >= min_units
  );
