-- review_asks.released_at: undo an ask that was never actually sent.
--
-- WHY
-- Trustpilot's plan caps how many invitations it delivers per month and
-- silently drops the rest. Between July and August 2026 the order-complete
-- email BCC'd 643 invitations against an allowance of 50 a month, so 543 of
-- them were never sent to anybody. The ask history added on 5 Sep 2026 then
-- recorded all 643 as "this customer has been asked", and decideReviewAsk
-- never offers Trustpilot to a customer who has a Trustpilot ask on record.
-- 286 customers are therefore locked out of Trustpilot for good, on the
-- strength of an email that does not exist.
--
-- Releasing marks the row instead of deleting it. The ask really was attempted
-- and the record of the attempt is worth keeping — which invitations were lost,
-- and when we handed them back, is the only evidence of what happened here.
-- loadReviewAskHistory skips released rows, so the customer reads as never
-- asked and becomes eligible again on their next completed order.
--
-- SAFE TO RUN BEFORE OR AFTER THE DEPLOY. Without it the Recovery card says the
-- migration has not been run and refuses to release anything; the read side
-- drops the filter and behaves exactly as it does today. Nothing else changes.
--
-- Run in: Supabase dashboard -> SQL Editor.

ALTER TABLE public.review_asks
  ADD COLUMN IF NOT EXISTS released_at     timestamptz,
  ADD COLUMN IF NOT EXISTS released_reason text;

-- Every read is "this customer's asks that still count", so released_at is in
-- the predicate of the hottest query there is. Partial, because the rows that
-- matter to that query are the ones that are NOT released.
CREATE INDEX IF NOT EXISTS review_asks_active_idx
  ON public.review_asks (customer_email, asked_at DESC)
  WHERE released_at IS NULL;

COMMENT ON COLUMN public.review_asks.released_at IS
  'Set when this ask was handed back because it was never actually delivered. The customer reads as never asked from here on; the row is kept as the record of the lost invitation.';
COMMENT ON COLUMN public.review_asks.released_reason IS
  'Why it was released, e.g. "over the Trustpilot monthly allowance for 2026-08".';

-- Verify:
--   SELECT COUNT(*) FROM public.review_asks WHERE released_at IS NOT NULL;
--   SELECT released_reason, COUNT(*) FROM public.review_asks
--    WHERE released_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;
--   -- customers who are eligible for Trustpilot again:
--   SELECT COUNT(DISTINCT customer_email) FROM public.review_asks
--    WHERE released_at IS NOT NULL;
