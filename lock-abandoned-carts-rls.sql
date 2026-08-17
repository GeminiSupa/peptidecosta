-- =========================================================================
-- Close public access to the abandoned-cart ledger
-- =========================================================================
-- RUN THIS ONLY AFTER the build carrying /api/cart/track is deployed. The
-- storefront wrote to this table directly from the browser until then, and
-- revoking first would silently stop cart recovery.
--
-- What was wrong: abandoned_carts carried
--   GRANT ALL ON TABLE public.abandoned_carts TO anon    (fix-abandoned-carts.sql)
-- plus four policies granted to the `public` role, every one of them USING
-- (true), for SELECT, INSERT, UPDATE and DELETE. The anon key those run under
-- is published inside the JS bundle, so anybody could read every shopper's
-- name, phone, email, IP address, geolocation, device string and cart
-- contents — and delete the table row by row through the REST API.
--
-- The storefront now writes through /api/cart/track on the service role, which
-- bypasses RLS. Staff keep their access through the same is_admin_user() check
-- that guards orders. Safe to re-run.

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

-- 1. Remove every legacy policy, including the four public ones ------------

DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'abandoned_carts'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.abandoned_carts', policy_row.policyname);
  END LOOP;
END;
$$;

-- 2. Privileges ------------------------------------------------------------

REVOKE ALL ON TABLE public.abandoned_carts FROM anon;
REVOKE ALL ON TABLE public.abandoned_carts FROM authenticated;

-- The dashboard reads carts client-side (AnalyticsDashboard), edits the
-- customer on them (CustomersCRM) and deletes them from three places in
-- src/app/admin/page.js. INSERT is deliberately not granted: new rows only ever
-- arrive through the service role.
GRANT SELECT, UPDATE, DELETE ON TABLE public.abandoned_carts TO authenticated;

-- 3. Staff-only policy -----------------------------------------------------

CREATE POLICY abandoned_carts_admin_all
ON public.abandoned_carts FOR ALL TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

-- 4. Verify ----------------------------------------------------------------
-- Expect: one policy (abandoned_carts_admin_all), and no anon row at all.

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'abandoned_carts';

SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'abandoned_carts'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee;
