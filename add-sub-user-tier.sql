-- =========================================================================
--            PEPTIDES COSTA RICA - SUB-USER TIER MIGRATION
-- =========================================================================
-- Run this in your Supabase SQL Editor. Safe to re-run.
--
-- Adds a second earning tier under sales staff. A sub-user is an ordinary
-- admin_profiles row with a parent, which is what lets logins, order
-- attribution (orders.sales_agent), the referral QR and the weekly payout
-- scan all keep working untouched.
--
-- The deal: a sub-user earns 8% of an order they bring, and their staff
-- member earns a 2% override on the same order. Total commission cost stays
-- at 10%. A staff member never also earns her own rate on a sub-user's order.
--
-- DEPTH IS CAPPED AT TWO. Staff -> sub-user, and no further. A sub-user
-- cannot have sub-users. Enforced here by trigger, in the API by
-- verifyAdminSession, and in the UI by the tab allow-list in adminModules.js.
--
-- BEFORE RUNNING: the unique name index below will fail if two profiles
-- share a name. Check first:
--   SELECT lower(trim(name)), count(*) FROM public.admin_profiles
--   GROUP BY 1 HAVING count(*) > 1;

-- -------------------------------------------------------------------------
-- 1. Columns
-- -------------------------------------------------------------------------
-- Every existing row becomes tier='staff' / status='active', so nothing
-- changes for anyone already using the dashboard.
ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS tier            TEXT NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES public.admin_profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS override_rate   NUMERIC NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS sub_user_cap    INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS invited_by      TEXT,
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by     TEXT;

-- -------------------------------------------------------------------------
-- 2. Constraints (dropped first so the whole script re-runs cleanly)
-- -------------------------------------------------------------------------
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS admin_profiles_tier_check;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_tier_check
  CHECK (tier IN ('staff', 'sub_user'));

ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS admin_profiles_status_check;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_status_check
  CHECK (status IN ('pending', 'active', 'suspended'));

-- A sub-user must have a parent; a staff member must not have one.
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS sub_user_has_parent;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT sub_user_has_parent CHECK (
    (tier = 'sub_user' AND parent_agent_id IS NOT NULL)
    OR
    (tier = 'staff' AND parent_agent_id IS NULL)
  );

-- Nobody is their own parent.
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS sub_user_not_self_parent;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT sub_user_not_self_parent CHECK (
    parent_agent_id IS NULL OR parent_agent_id <> user_id
  );

-- A superadmin is never a sub-user. Guards against a privilege mistake
-- handing an outsider the whole dashboard.
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS sub_user_never_superadmin;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT sub_user_never_superadmin CHECK (
    NOT (tier = 'sub_user' AND is_superadmin = true)
  );

-- -------------------------------------------------------------------------
-- 3. Two levels only
-- -------------------------------------------------------------------------
-- A CHECK constraint cannot look at another row, so the depth rule needs a
-- trigger. It closes both directions:
--   a) you cannot attach a sub-user to someone who is already a sub-user
--   b) you cannot demote a staff member who already has sub-users of her own
-- Without (b) you could reach three levels by editing an existing row
-- instead of inserting a new one.
CREATE OR REPLACE FUNCTION public.enforce_sub_user_depth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tier <> 'sub_user' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_profiles parent
    WHERE parent.user_id = NEW.parent_agent_id
      AND parent.tier <> 'staff'
  ) THEN
    RAISE EXCEPTION
      'A sub-user cannot be placed under another sub-user (only two levels are allowed)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_profiles child
    WHERE child.parent_agent_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION
      'This person already has sub-users, so they cannot become a sub-user themselves';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sub_user_depth ON public.admin_profiles;
CREATE TRIGGER trg_sub_user_depth
  BEFORE INSERT OR UPDATE OF tier, parent_agent_id
  ON public.admin_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sub_user_depth();

-- -------------------------------------------------------------------------
-- 4. Indexes
-- -------------------------------------------------------------------------
-- orders.sales_agent is free text matched against a profile's name (see
-- agentMatchKeys in src/lib/agentOrders.js). Two people sharing a name would
-- silently split one person's commission, so names must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_profiles_name_lower
  ON public.admin_profiles (lower(trim(name)));

-- "Who are my people?" and the weekly override pass both read this.
CREATE INDEX IF NOT EXISTS idx_admin_profiles_parent
  ON public.admin_profiles (parent_agent_id)
  WHERE parent_agent_id IS NOT NULL;

-- The owner's approval queue.
CREATE INDEX IF NOT EXISTS idx_admin_profiles_pending
  ON public.admin_profiles (status, created_at DESC)
  WHERE status = 'pending';

-- -------------------------------------------------------------------------
-- 5. Verify
-- -------------------------------------------------------------------------
-- Existing staff should all read staff / active / no parent:
--   SELECT name, tier, status, parent_agent_id FROM public.admin_profiles;
--
-- The depth cap should refuse this (expect an exception):
--   UPDATE public.admin_profiles SET tier = 'sub_user',
--     parent_agent_id = (SELECT user_id FROM public.admin_profiles
--                        WHERE tier = 'sub_user' LIMIT 1)
--   WHERE name = 'Some Staff Member';
