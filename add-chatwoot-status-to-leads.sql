-- Records whether each Google Ads lead (/lp, /glp-1) reached Chatwoot.
--
-- /api/leads/contact opens a Chatwoot chat for every ad lead, but the result
-- only ever went to the Vercel logs, so a lead whose chat failed looked exactly
-- like one that worked. The Leads tab's "Google Ads → Chatwoot" section reads
-- these columns. Until this runs, the route skips them and the section shows
-- "Not recorded".
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_status TEXT DEFAULT NULL;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_error TEXT DEFAULT NULL;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_conversation_url TEXT DEFAULT NULL;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_synced_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.catalog_leads DROP CONSTRAINT IF EXISTS catalog_leads_chatwoot_status_check;
ALTER TABLE public.catalog_leads ADD CONSTRAINT catalog_leads_chatwoot_status_check
  CHECK (chatwoot_status IS NULL OR chatwoot_status IN ('sent', 'unassigned', 'failed', 'not_configured', 'off'));

NOTIFY pgrst, 'reload schema';
