-- Per-product free bacteriostatic water settings.
--
-- Run this ONCE in the Supabase SQL editor BEFORE deploying the related code.
-- Safe to re-run (IF NOT EXISTS).
--
-- Free BAC water used to be a single hard-coded rule: one 3ml vial per peptide,
-- with syringes and the ready-to-use amino blends excluded by name. These three
-- columns move that decision onto each product so it can be changed from the
-- Products tab without a deploy:
--
--   free_bac_water          whether this product ships any free vials at all
--   free_bac_size_ml        the free vial size, 3 or 10
--   free_bac_vials_per_item how many free vials each unit bought earns
--
-- They are intentionally left NULL for existing rows. A product with no setting
-- falls back to the old name-based rule, so nothing changes until an admin
-- deliberately edits a product and saves. Once the Products tab is saved, every
-- row is written with an explicit value.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS free_bac_water boolean,
  ADD COLUMN IF NOT EXISTS free_bac_size_ml integer,
  ADD COLUMN IF NOT EXISTS free_bac_vials_per_item integer;
