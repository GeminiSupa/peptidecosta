-- Flash sales: a second promotion that runs alongside the Deal of the Week.
--
-- Run in the Supabase SQL editor BEFORE deploying the code that uses it.
-- Safe to run more than once. Existing deals are untouched: they become
-- kind = 'weekly', which is exactly what they were.
--
-- A flash sale is an ordinary row in `deals` with kind = 'flash'. It always
-- uses pricing_mode = 'offers', so it never rewrites shelf prices, and its
-- window is whatever the admin chose rather than the Sunday boundary. At
-- checkout its offers are compared against the weekly deal's offers and the
-- volume tier, and the customer gets the single best one - discounts still
-- never stack.

BEGIN;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'weekly';

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_kind_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_kind_check
  CHECK (kind IN ('weekly', 'flash'));

-- One live deal PER KIND, instead of one live deal overall. Two weekly deals
-- would still fight over the same baseline, but a weekly deal and a flash sale
-- are independent: the flash never touches shelf prices, and the checkout
-- compares their offers rather than applying both.
DROP INDEX IF EXISTS idx_deals_single_live;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_single_live_per_kind
  ON public.deals((kind))
  WHERE status = 'live';

-- The scheduled-deal reader picks the earliest draft; keep weekly and flash
-- drafts from being mistaken for one another.
CREATE INDEX IF NOT EXISTS idx_deals_kind_status
  ON public.deals(kind, status);

COMMIT;

-- PostgREST caches the table shape; this makes the new column usable at once.
NOTIFY pgrst, 'reload schema';
