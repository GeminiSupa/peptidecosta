-- Retire the legacy WELCOME- new-customer codes.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (a second run deletes 0).
--
-- WHY
-- These were generated per-lead by /api/leads/capture until commit 24897ba
-- ("Stop offering 15% off to new customers") switched that off. Generation
-- stopped; the codes did not. As of 2026-07-30 there were 647 of them, and 634
-- were still fully usable: 15% off, target_product NULL so they apply to EVERY
-- product, once_per_customer false, no usage_limit, no expiry. Anyone holding
-- one can spend it repeatedly, forever.
--
-- They also stack with the automatic volume discount — see
-- getPromoDiscountAmount in src/app/catalog/page.js, which applies the promo
-- percentage to the already volume-discounted subtotal. On a $100 vial at 5
-- units that is $100 -> $85 -> $72.25, i.e. 27.75% off list. Layer a Deal of
-- the Week markdown under that and it reaches 38.6%.
--
-- The current welcome offer is PRIMERPEDIDO15, sent by the welcome email
-- campaign. It is deliberately NOT touched here: it does not match the
-- 'WELCOME-%' pattern, and the WHERE clause is further restricted below.
--
-- WHAT THIS KEEPS
-- The 13 codes with usage_count > 0 are left in place. Every one of them is
-- usage 1 of limit 1, so they are already spent and cannot be redeemed again —
-- keeping them costs nothing and preserves the trail for the 9 orders that
-- reference a WELCOME- code. orders.promo_code is plain text with no foreign
-- key, and the order rows carry their own discount_amount_usd/crc, so the
-- financial record is self-contained either way; this just keeps the code
-- itself resolvable when someone looks an old order up.

-- 1. Before: what is about to go, and what is being kept.
SELECT
  count(*) FILTER (WHERE usage_count = 0 AND affiliate_id IS NULL) AS will_delete,
  count(*) FILTER (WHERE usage_count > 0) AS kept_spent,
  count(*) FILTER (WHERE affiliate_id IS NOT NULL) AS kept_affiliate_linked,
  count(*) AS total_welcome_codes
FROM public.promo_codes
WHERE code LIKE 'WELCOME-%';

-- 2. Delete only the never-redeemed ones.
--
-- usage_count = 0        never spent, so nothing references it
-- affiliate_id IS NULL   belt and braces. None are affiliate-linked today, but
--                        deleting an affiliate's code would strip the link
--                        behind their commission reporting, so the delete
--                        refuses to touch one on principle.
DELETE FROM public.promo_codes
WHERE code LIKE 'WELCOME-%'
  AND usage_count = 0
  AND affiliate_id IS NULL;

-- 3. After: expect 0 usable WELCOME- codes, and the spent ones still present.
SELECT
  count(*) AS remaining_welcome_codes,
  count(*) FILTER (
    WHERE is_active
      AND (valid_until IS NULL OR valid_until >= now())
      AND (usage_limit IS NULL OR usage_count < usage_limit)
  ) AS still_usable
FROM public.promo_codes
WHERE code LIKE 'WELCOME-%';

-- 4. Confirm the live welcome offer is untouched and unchanged.
--    Expect: 15%, min_units 4, valid until 2026-09-26, once_per_customer false.
SELECT code, discount_pct, is_active, min_units, valid_until, once_per_customer, usage_count
FROM public.promo_codes
WHERE code = 'PRIMERPEDIDO15';
