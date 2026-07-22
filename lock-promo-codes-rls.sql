-- Closes the hole that let anonymous visitors write to promo_codes.
--
-- ORDER MATTERS: run this only AFTER commit 053f52e is deployed. That commit
-- moves the admin panel's promo writes server-side; run this first and promo
-- create/toggle/delete break until the deploy lands.
--
-- Safe to re-run.
--
-- The old "Enable all access for service role" policy had no role restriction,
-- so it granted ALL access to EVERY role - including anon, the key shipped to
-- every visitor's browser. A zero-row UPDATE probe with the anon key was
-- accepted, confirming the exposure.
--
-- After this: reads stay public (the catalog needs badge promos, and code
-- validity was never a secret). Writes work only through the server API
-- routes, because the service role bypasses RLS entirely and therefore needs
-- no policy of its own.

DROP POLICY IF EXISTS "Enable all access for service role on promo_codes" ON public.promo_codes;

DROP POLICY IF EXISTS "Enable read access for public on promo_codes" ON public.promo_codes;
CREATE POLICY "Public can read promo codes"
  ON public.promo_codes FOR SELECT USING (true);
