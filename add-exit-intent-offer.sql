-- Exit-intent discount offers: per-visitor promo codes minted when someone
-- with a cart tries to leave the catalog.
--
-- Run this ONCE in the Supabase SQL editor BEFORE deploying the related code.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT).
--
-- The codes themselves are ordinary promo_codes rows — they reuse valid_until
-- for the 20-minute deadline, usage_limit for single use, and hidden so they
-- never surface in a badge or an order email. These two columns are only about
-- WHO a code was minted for, which is what makes "one per person, ever"
-- enforceable rather than a client-side hope.

ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS auto_issued boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS issued_to text,
  ADD COLUMN IF NOT EXISTS issued_session text;

-- The "once ever" rule, enforced by the database rather than by the endpoint.
-- Two tabs racing the same visitor both pass the "have you had one?" read; only
-- one of them can win this index, and the loser re-reads the winner's code.
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_issued_to_key
  ON promo_codes (issued_to)
  WHERE issued_to IS NOT NULL;

-- The second identity. A visitor who clears their browser gets a new session id
-- but keeps their email; one who never leaves an email is only ever known by
-- the session. Matching on either is what stops the obvious re-mint.
CREATE INDEX IF NOT EXISTS promo_codes_issued_session_idx
  ON promo_codes (issued_session)
  WHERE issued_session IS NOT NULL;

-- Tunables, so the offer can be changed without a deploy.
--   enabled       turn the whole thing off in one edit
--   discountPct   0.10 = 10%, matching promo_codes.discount_pct
--   windowMinutes how long a minted code lives
--   minCartUsd    carts below this are never offered a discount
INSERT INTO public.site_settings (id, value)
VALUES (
  'exit_intent_offer',
  '{"enabled": true, "discountPct": 0.10, "windowMinutes": 20, "minCartUsd": 0}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
