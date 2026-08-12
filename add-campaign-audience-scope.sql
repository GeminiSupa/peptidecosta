-- Campaign recipients used to be a yes/no: include CRM leads, or don't. That
-- cannot express "leads only", and a boolean also cannot survive the cron,
-- which re-reads the campaign row for every batch after the first.
--
--   subscribers  newsletter/catalog-gate signups only
--   leads        CRM lead emails only
--   all          both
--
-- include_leads stays in sync so anything still reading it keeps working.
-- Safe to run more than once.

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS audience_scope TEXT NOT NULL DEFAULT 'subscribers';

DO $$
BEGIN
  ALTER TABLE public.email_campaigns
    ADD CONSTRAINT email_campaigns_audience_scope_check
    CHECK (audience_scope IN ('subscribers', 'leads', 'all'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Existing campaigns: include_leads = true meant subscribers AND leads.
UPDATE public.email_campaigns
SET audience_scope = 'all'
WHERE include_leads IS TRUE
  AND audience_scope = 'subscribers';

NOTIFY pgrst, 'reload schema';
