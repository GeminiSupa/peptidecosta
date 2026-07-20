-- Adds support for "one-time use per customer" promo codes.
-- Run this ONCE in the Supabase SQL editor BEFORE deploying the related code.
-- Safe to re-run (IF NOT EXISTS). Existing codes default to false (unchanged behaviour).

ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS once_per_customer boolean NOT NULL DEFAULT false;
