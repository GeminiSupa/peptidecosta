-- CRM-first lead identity and ownership tracking.
-- Safe to run more than once. Apply before deploying the Claim or Add Lead UI.

ALTER TABLE public.catalog_leads
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS sales_agent TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_source TEXT,
  ADD COLUMN IF NOT EXISTS source_whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS ownership_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ownership_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- One normalized phone or email points to one canonical CRM lead. This catches
-- the same person whether an agent enters +506 8404-6973, 84046973, or uses
-- their email on a later interaction.
CREATE TABLE IF NOT EXISTS public.lead_contact_identities (
  identity_type TEXT NOT NULL CHECK (identity_type IN ('email', 'phone')),
  identity_value TEXT NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.catalog_leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identity_type, identity_value)
);

CREATE INDEX IF NOT EXISTS lead_contact_identities_lead_idx
  ON public.lead_contact_identities(lead_id);

CREATE TABLE IF NOT EXISTS public.lead_assignment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.catalog_leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'claimed', 'auto_assigned', 'transferred', 'unassigned')),
  previous_agent TEXT,
  new_agent TEXT,
  reason TEXT,
  actor_user_id UUID,
  actor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_assignment_events_lead_idx
  ON public.lead_assignment_events(lead_id, created_at DESC);

ALTER TABLE public.lead_contact_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignment_events ENABLE ROW LEVEL SECURITY;

UPDATE public.catalog_leads
SET sales_agent = NULL
WHERE TRIM(COALESCE(sales_agent, '')) = '';

-- Backfill one canonical identity per existing contact. DISTINCT ON keeps the
-- earliest CRM row when old duplicates exist; they can then be reviewed and
-- merged without making this migration fail.
INSERT INTO public.lead_contact_identities (identity_type, identity_value, lead_id)
SELECT DISTINCT ON (identity_value) 'email', identity_value, id
FROM (
  SELECT
    id,
    created_at,
    LOWER(TRIM(COALESCE(email, CASE WHEN contact_value LIKE '%@%' THEN contact_value END))) AS identity_value
  FROM public.catalog_leads
) existing_emails
WHERE identity_value IS NOT NULL AND identity_value LIKE '%@%'
ORDER BY identity_value, created_at ASC NULLS LAST, id
ON CONFLICT (identity_type, identity_value) DO NOTHING;

INSERT INTO public.lead_contact_identities (identity_type, identity_value, lead_id)
SELECT DISTINCT ON (identity_value) 'phone', identity_value, id
FROM (
  SELECT
    id,
    created_at,
    RIGHT(REGEXP_REPLACE(COALESCE(phone, CASE WHEN contact_value NOT LIKE '%@%' THEN contact_value END, ''), '\D', '', 'g'), 8) AS identity_value
  FROM public.catalog_leads
) existing_phones
WHERE LENGTH(identity_value) = 8
ORDER BY identity_value, created_at ASC NULLS LAST, id
ON CONFLICT (identity_type, identity_value) DO NOTHING;

-- Keep identities current for every lead source: catalog gate, contact form,
-- live chat, Facebook, and manual CRM entry.
CREATE OR REPLACE FUNCTION public.sync_catalog_lead_identities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_email TEXT;
  normalized_phone TEXT;
BEGIN
  normalized_email := LOWER(TRIM(COALESCE(
    NEW.email,
    CASE WHEN NEW.contact_value LIKE '%@%' THEN NEW.contact_value END
  )));
  normalized_phone := RIGHT(REGEXP_REPLACE(COALESCE(
    NEW.phone,
    CASE WHEN NEW.contact_value NOT LIKE '%@%' THEN NEW.contact_value END,
    ''
  ), '\D', '', 'g'), 8);

  IF normalized_email LIKE '%@%' THEN
    INSERT INTO public.lead_contact_identities(identity_type, identity_value, lead_id)
    VALUES ('email', normalized_email, NEW.id)
    ON CONFLICT (identity_type, identity_value) DO NOTHING;
  END IF;

  IF LENGTH(normalized_phone) = 8 THEN
    INSERT INTO public.lead_contact_identities(identity_type, identity_value, lead_id)
    VALUES ('phone', normalized_phone, NEW.id)
    ON CONFLICT (identity_type, identity_value) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_catalog_lead_identities ON public.catalog_leads;
CREATE TRIGGER trg_sync_catalog_lead_identities
  AFTER INSERT OR UPDATE OF contact_value, email, phone ON public.catalog_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_catalog_lead_identities();

-- Authenticated browsers may still edit notes and pipeline stages, but lead
-- ownership must go through the audited admin API (which uses service_role).
CREATE OR REPLACE FUNCTION public.guard_catalog_lead_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated'
     AND OLD.sales_agent IS DISTINCT FROM NEW.sales_agent THEN
    RAISE EXCEPTION 'Lead ownership changes must use the CRM claim API';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_catalog_lead_owner_update ON public.catalog_leads;
CREATE TRIGGER trg_guard_catalog_lead_owner_update
  BEFORE UPDATE OF sales_agent ON public.catalog_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_catalog_lead_owner_update();

-- Shared CRM data should only be removable by a superadmin. Agents can still
-- update pipeline fields and notes through the existing authenticated policy.
DROP POLICY IF EXISTS "Allow authenticated deletes on catalog_leads" ON public.catalog_leads;
DROP POLICY IF EXISTS "Allow superadmins to delete catalog_leads" ON public.catalog_leads;
CREATE POLICY "Allow superadmins to delete catalog_leads"
  ON public.catalog_leads
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.is_superadmin IS TRUE
    )
  );

NOTIFY pgrst, 'reload schema';
