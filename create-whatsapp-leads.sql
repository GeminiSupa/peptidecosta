-- whatsapp_leads: one row per click on an "Order on WhatsApp" button.
--
-- WHY THIS EXISTS
-- src/lib/whatsapp.ts has been inserting into this table for a long time, but
-- the table was never created, so every click was discarded (supabase-js
-- returns the error rather than throwing, and the caller ignored it). The
-- campaign was therefore only visible because it was pasted into the customer's
-- own WhatsApp message as "[Source: email (Camp: ...)]". That note has been
-- removed from what the customer sends; this table is where it goes instead.
--
-- RUN THIS BEFORE deploying the change, or clicks keep being discarded until
-- it exists. Nothing breaks either way — the insert fails quietly.
--
-- Run in: Supabase dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS public.whatsapp_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    text,
  source        text,                    -- which button: catalog_sticky_cta, footer_cr, bulk_cta...
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  referrer      text,                    -- hostname only, never the full URL
  lang          text,
  clicked_at    timestamptz NOT NULL DEFAULT now()
);

-- The dashboard reads these newest-first and filters by campaign.
CREATE INDEX IF NOT EXISTS whatsapp_leads_clicked_at_idx
  ON public.whatsapp_leads (clicked_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_leads_campaign_idx
  ON public.whatsapp_leads (utm_campaign)
  WHERE utm_campaign IS NOT NULL;

-- The write happens in the visitor's browser under the anon key, so anon needs
-- INSERT. It gets nothing else: no SELECT policy is defined, so no visitor can
-- read back what anyone else clicked. Admin screens read this through the
-- service role, which bypasses RLS.
ALTER TABLE public.whatsapp_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_leads_anon_insert ON public.whatsapp_leads;
CREATE POLICY whatsapp_leads_anon_insert
  ON public.whatsapp_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Verify:
--   SELECT COUNT(*) FROM public.whatsapp_leads;
--   SELECT utm_campaign, COUNT(*) FROM public.whatsapp_leads
--   GROUP BY utm_campaign ORDER BY 2 DESC;
