-- Channel-specific permission evidence for Prospector outreach.
-- Run after prospector-migration.sql and before deploying the matching code.

ALTER TABLE public.sales_prospects
  ADD COLUMN IF NOT EXISTS email_permission_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS email_permission_basis TEXT,
  ADD COLUMN IF NOT EXISTS email_permission_source_url TEXT,
  ADD COLUMN IF NOT EXISTS email_permission_evidence TEXT,
  ADD COLUMN IF NOT EXISTS email_permission_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_permission_verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_permission_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS whatsapp_permission_basis TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_permission_source_url TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_permission_evidence TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_permission_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_permission_verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sales_prospects
  DROP CONSTRAINT IF EXISTS sales_prospects_email_permission_check,
  DROP CONSTRAINT IF EXISTS sales_prospects_whatsapp_permission_check,
  DROP CONSTRAINT IF EXISTS sales_prospects_email_permission_basis_check,
  DROP CONSTRAINT IF EXISTS sales_prospects_whatsapp_permission_basis_check;

ALTER TABLE public.sales_prospects
  ADD CONSTRAINT sales_prospects_email_permission_check CHECK (
    email_permission_status IN ('unknown','business_contact','consented','do_not_contact')
  ),
  ADD CONSTRAINT sales_prospects_whatsapp_permission_check CHECK (
    whatsapp_permission_status IN ('unknown','business_contact','consented','do_not_contact')
  ),
  ADD CONSTRAINT sales_prospects_email_permission_basis_check CHECK (
    email_permission_basis IS NULL OR email_permission_basis IN ('published_business_contact','express_consent','opt_out')
  ),
  ADD CONSTRAINT sales_prospects_whatsapp_permission_basis_check CHECK (
    whatsapp_permission_basis IS NULL OR whatsapp_permission_basis IN ('published_business_contact','express_consent','opt_out')
  );

-- A historic global opt-out is safe to preserve for both channels. Historic
-- business-contact/consent values are intentionally NOT copied: the old model
-- did not say which channel the evidence covered.
UPDATE public.sales_prospects
SET
  email_permission_status = 'do_not_contact',
  email_permission_basis = 'opt_out',
  email_permission_evidence = COALESCE(email_permission_evidence, 'Migrated from the historic global opt-out'),
  email_permission_verified_at = COALESCE(email_permission_verified_at, NOW()),
  whatsapp_permission_status = 'do_not_contact',
  whatsapp_permission_basis = 'opt_out',
  whatsapp_permission_evidence = COALESCE(whatsapp_permission_evidence, 'Migrated from the historic global opt-out'),
  whatsapp_permission_verified_at = COALESCE(whatsapp_permission_verified_at, NOW())
WHERE contact_permission_status = 'do_not_contact' OR status = 'do_not_contact';

-- Keep the old summary column only as a filter/scoring compatibility field.
-- It is derived from the two channel records and never grants permission by
-- itself after this migration.
UPDATE public.sales_prospects
SET contact_permission_status = CASE
  WHEN email_permission_status = 'do_not_contact' AND whatsapp_permission_status = 'do_not_contact' THEN 'do_not_contact'
  WHEN email_permission_status = 'consented' OR whatsapp_permission_status = 'consented' THEN 'consented'
  WHEN email_permission_status = 'business_contact' OR whatsapp_permission_status = 'business_contact' THEN 'business_contact'
  ELSE 'unknown'
END;

CREATE INDEX IF NOT EXISTS sales_prospects_email_permission_idx
  ON public.sales_prospects (email_permission_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS sales_prospects_whatsapp_permission_idx
  ON public.sales_prospects (whatsapp_permission_status, updated_at DESC);
