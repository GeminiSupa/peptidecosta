-- Make every sales-agent staff profile a linked 20% affiliate.
-- Safe to re-run. Run in the Supabase SQL Editor before deploying the code.

ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS admin_profile_user_id UUID
    REFERENCES public.admin_profiles(user_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS affiliate_kind TEXT NOT NULL DEFAULT 'external';

ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_kind_check;
ALTER TABLE public.affiliates
  ADD CONSTRAINT affiliates_kind_check
  CHECK (affiliate_kind IN ('external', 'sales_agent'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_admin_profile_user
  ON public.affiliates(admin_profile_user_id)
  WHERE admin_profile_user_id IS NOT NULL;

-- Link a manually-created affiliate first when it already uses the agent's
-- email. This preserves promo codes and historical orders tied to that row.
UPDATE public.affiliates affiliate
SET admin_profile_user_id = profile.user_id,
    affiliate_kind = 'sales_agent',
    name = COALESCE(NULLIF(trim(profile.name), ''), profile.email),
    email = profile.email,
    whatsapp = COALESCE(NULLIF(trim(profile.whatsapp_number), ''), affiliate.whatsapp),
    commission_rate = 0.20
FROM public.admin_profiles profile
WHERE affiliate.admin_profile_user_id IS NULL
  AND lower(trim(affiliate.email)) = lower(trim(profile.email))
  AND COALESCE(profile.tier, 'staff') = 'staff'
  AND COALESCE(profile.is_superadmin, false) = false;

INSERT INTO public.affiliates (
  name, email, whatsapp, commission_rate, admin_profile_user_id, affiliate_kind
)
SELECT
  COALESCE(NULLIF(trim(profile.name), ''), profile.email),
  profile.email,
  NULLIF(trim(profile.whatsapp_number), ''),
  0.20,
  profile.user_id,
  'sales_agent'
FROM public.admin_profiles profile
WHERE COALESCE(profile.tier, 'staff') = 'staff'
  AND COALESCE(profile.is_superadmin, false) = false
  AND profile.user_id IS NOT NULL
ON CONFLICT (admin_profile_user_id) WHERE admin_profile_user_id IS NOT NULL
DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  whatsapp = COALESCE(EXCLUDED.whatsapp, public.affiliates.whatsapp),
  commission_rate = 0.20,
  affiliate_kind = 'sales_agent';

CREATE OR REPLACE FUNCTION public.sync_sales_agent_affiliate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.tier, 'staff') <> 'staff'
     OR COALESCE(NEW.is_superadmin, false) = true
     OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Preserve an existing ordinary affiliate with the same email by turning it
  -- into the linked agent record instead of creating a duplicate identity.
  UPDATE public.affiliates
  SET admin_profile_user_id = NEW.user_id,
      affiliate_kind = 'sales_agent',
      name = COALESCE(NULLIF(trim(NEW.name), ''), NEW.email),
      email = NEW.email,
      whatsapp = COALESCE(NULLIF(trim(NEW.whatsapp_number), ''), whatsapp),
      commission_rate = 0.20
  WHERE admin_profile_user_id IS NULL
    AND lower(trim(email)) = lower(trim(NEW.email));

  INSERT INTO public.affiliates (
    name, email, whatsapp, commission_rate, admin_profile_user_id, affiliate_kind
  ) VALUES (
    COALESCE(NULLIF(trim(NEW.name), ''), NEW.email),
    NEW.email,
    NULLIF(trim(NEW.whatsapp_number), ''),
    0.20,
    NEW.user_id,
    'sales_agent'
  )
  ON CONFLICT (admin_profile_user_id) WHERE admin_profile_user_id IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    whatsapp = COALESCE(EXCLUDED.whatsapp, public.affiliates.whatsapp),
    commission_rate = 0.20,
    affiliate_kind = 'sales_agent';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sales_agent_affiliate ON public.admin_profiles;
CREATE TRIGGER trg_sync_sales_agent_affiliate
  AFTER INSERT OR UPDATE OF name, email, whatsapp_number, tier, is_superadmin
  ON public.admin_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_sales_agent_affiliate();

COMMENT ON COLUMN public.affiliates.admin_profile_user_id IS
  'Links a 20% sales-agent affiliate identity to the same admin profile.';
COMMENT ON COLUMN public.affiliates.affiliate_kind IS
  'external affiliates use affiliate payouts; sales_agent affiliates use one combined agent payout.';
