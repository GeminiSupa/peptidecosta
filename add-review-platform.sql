-- orders.review_platform: which review site this order was asked for.
--
-- WHY
-- Review invitations are now split between Trustpilot and Google/Facebook, and
-- Trustpilot's plan caps how many invitations may be sent per month. To respect
-- that cap the code has to count how many Trustpilot invitations have already
-- gone out this month, which means knowing which site each order went to.
-- `review_requested_at` alone cannot answer that: both halves stamp it.
--
-- SAFE TO RUN BEFORE OR AFTER THE DEPLOY. Without it, the count falls back to
-- every stamped order in the month. That over-counts, so more orders go to
-- Google and the Trustpilot cap is never exceeded — the safe direction.
--
-- Run in: Supabase dashboard -> SQL Editor.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS review_platform text;

COMMENT ON COLUMN public.orders.review_platform IS
  'trustpilot | google - which review site this order was asked for';

-- The cap query is "this month, on Trustpilot", so index that pair.
CREATE INDEX IF NOT EXISTS orders_review_platform_requested_idx
  ON public.orders (review_platform, review_requested_at)
  WHERE review_platform IS NOT NULL;

-- Backfill: every invitation sent before the split went to Trustpilot, because
-- it was the only path that ever sent one.
UPDATE public.orders
   SET review_platform = 'trustpilot'
 WHERE review_requested_at IS NOT NULL
   AND review_platform IS NULL;

-- Verify:
--   SELECT review_platform, COUNT(*) FROM public.orders
--   WHERE review_requested_at IS NOT NULL GROUP BY review_platform;
--
--   -- this month's Trustpilot usage, the number the cap is checked against:
--   SELECT COUNT(*) FROM public.orders
--   WHERE review_platform = 'trustpilot'
--     AND review_requested_at >= date_trunc('month', now());
