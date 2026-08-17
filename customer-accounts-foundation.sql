-- =========================================================================
-- Customer accounts: secure ownership foundation
-- =========================================================================
-- Safe to re-run. Guest checkout continues through /api/orders/create, whose
-- service-role client bypasses RLS. Browsers no longer receive public access to
-- the order ledger.

-- 1. Customer-owned data ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  phone TEXT,
  locale TEXT NOT NULL DEFAULT 'es' CHECK (locale IN ('es', 'en')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_profiles_email_unique
  ON public.customer_profiles (lower(trim(email)));

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  recipient_name TEXT NOT NULL,
  phone TEXT,
  country_code TEXT NOT NULL DEFAULT 'CR',
  province TEXT,
  canton TEXT,
  district TEXT,
  detailed_address TEXT NOT NULL,
  postal_code TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_addresses_owner_idx
  ON public.customer_addresses (customer_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_one_default_idx
  ON public.customer_addresses (customer_user_id)
  WHERE is_default = true;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_customer_user_created_idx
  ON public.orders (customer_user_id, created_at DESC)
  WHERE customer_user_id IS NOT NULL;

-- 2. Shared helpers --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_customer_account_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_profiles_touch_updated_at ON public.customer_profiles;
CREATE TRIGGER customer_profiles_touch_updated_at
BEFORE UPDATE ON public.customer_profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_customer_account_updated_at();

DROP TRIGGER IF EXISTS customer_addresses_touch_updated_at ON public.customer_addresses;
CREATE TRIGGER customer_addresses_touch_updated_at
BEFORE UPDATE ON public.customer_addresses
FOR EACH ROW EXECUTE FUNCTION public.touch_customer_account_updated_at();

-- SECURITY DEFINER avoids depending on admin_profiles' own RLS policy while
-- checking whether the signed-in user is an active dashboard team member.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles profile
    WHERE profile.user_id = auth.uid()
      AND coalesce(lower(to_jsonb(profile)->>'status'), 'active') NOT IN ('pending', 'suspended')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- 3. Privileges and row-level security ------------------------------------

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_profiles FROM anon;
REVOKE ALL ON TABLE public.customer_addresses FROM anon;
REVOKE ALL ON TABLE public.orders FROM anon;

REVOKE ALL ON TABLE public.customer_profiles FROM authenticated;
REVOKE ALL ON TABLE public.customer_addresses FROM authenticated;
REVOKE ALL ON TABLE public.orders FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_addresses TO authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.orders TO authenticated;

-- Remove every legacy order policy, including the old public SELECT/UPDATE
-- policies shipped by fix-rls-policies.sql.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', policy_row.policyname);
  END LOOP;
END;
$$;

-- Customer accounts and staff accounts share auth.users. The former broad
-- authenticated policy would let any future customer enumerate staff names,
-- emails, roles, and permissions, so admin_profiles must be staff-only too.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.admin_profiles', policy_row.policyname);
  END LOOP;
END;
$$;

CREATE POLICY admin_profiles_active_staff_read
ON public.admin_profiles FOR SELECT TO authenticated
USING (public.is_admin_user());

DROP POLICY IF EXISTS customer_profiles_read_own ON public.customer_profiles;
DROP POLICY IF EXISTS customer_profiles_insert_own ON public.customer_profiles;
DROP POLICY IF EXISTS customer_profiles_update_own ON public.customer_profiles;
DROP POLICY IF EXISTS customer_profiles_admin_all ON public.customer_profiles;

CREATE POLICY customer_profiles_read_own
ON public.customer_profiles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY customer_profiles_insert_own
ON public.customer_profiles FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
);

CREATE POLICY customer_profiles_update_own
ON public.customer_profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
);

CREATE POLICY customer_profiles_admin_all
ON public.customer_profiles FOR ALL TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS customer_addresses_own ON public.customer_addresses;
DROP POLICY IF EXISTS customer_addresses_admin_all ON public.customer_addresses;

CREATE POLICY customer_addresses_own
ON public.customer_addresses FOR ALL TO authenticated
USING (customer_user_id = auth.uid())
WITH CHECK (customer_user_id = auth.uid());

CREATE POLICY customer_addresses_admin_all
ON public.customer_addresses FOR ALL TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

CREATE POLICY orders_customer_read_own
ON public.orders FOR SELECT TO authenticated
USING (customer_user_id = auth.uid());

CREATE POLICY orders_admin_all
ON public.orders FOR ALL TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());
