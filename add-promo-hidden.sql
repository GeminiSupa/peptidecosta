-- Adds support for "hidden" promo codes that are never surfaced to customers
-- (e.g. kept out of order-confirmation emails) — usable only by people who know
-- the code. Run this ONCE in the Supabase SQL editor BEFORE deploying the code.
-- Safe to re-run. Existing codes default to false (unchanged behaviour).

ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
