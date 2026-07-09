-- WhatsApp / marketing consent capture for catalog leads.
-- Run this in the Supabase SQL Editor BEFORE deploying the consent-checkbox change.
-- Safe to run more than once (IF NOT EXISTS guards).

ALTER TABLE public.catalog_leads
  ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.catalog_leads
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.catalog_leads
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

ALTER TABLE public.catalog_leads
  ADD COLUMN IF NOT EXISTS consent_source TEXT;

-- Quick lookups of who opted in to WhatsApp marketing.
CREATE INDEX IF NOT EXISTS idx_catalog_leads_whatsapp_consent
  ON public.catalog_leads (whatsapp_consent) WHERE whatsapp_consent = true;
