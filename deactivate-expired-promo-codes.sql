-- Make is_active tell the truth on promo_codes.
--
-- Exit-intent codes are minted with is_active = true and a short valid_until,
-- and nothing ever flips the flag back when the window closes. The result was a
-- table where the flag meant almost nothing: 180 rows read as active and only 4
-- of them were actually usable. 163 were past their valid_until — 157 of those
-- the personal codes handed out by the exit-intent popup.
--
-- Nothing was mis-charging over it. Checkout and the WhatsApp assistant both
-- check the date rather than the flag, so an expired code was already refused.
-- The risk is the next reader: anything that trusts is_active on its own is
-- wrong about 98% of the rows, and that is a trap to leave lying around.
--
-- Only the date decides here. A code that has reached its usage_limit is left
-- alone on purpose — that is a limit someone may want to raise, which is a
-- different decision from an expiry that has simply passed.
--
-- Safe to run more than once; the second run matches nothing.

UPDATE public.promo_codes
   SET is_active = false
 WHERE is_active = true
   AND valid_until IS NOT NULL
   AND valid_until < now();

-- What is left should be the codes with no expiry, plus any whose window is
-- still open. Expect a handful, not hundreds.
SELECT code, hidden, valid_until, usage_count, usage_limit
  FROM public.promo_codes
 WHERE is_active = true
 ORDER BY valid_until NULLS FIRST;
