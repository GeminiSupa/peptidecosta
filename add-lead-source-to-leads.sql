-- Alter public.catalog_leads to record where a lead actually came from.
--
-- /api/leads/contact has always sent `lead_source` (adwords_lp, contact_form,
-- live_chat...), but the column never existed, so writeDroppingMissingColumns
-- quietly discarded it on every write. The origin survived only inside the
-- notes text as "Contáctenos form (adwords_lp)", which nothing can filter or
-- group by. With paid traffic about to arrive, "which leads did the ad budget
-- actually buy" needs to be answerable without reading notes by eye.
--
-- The Leads tab's existing Source dropdown filters by contact channel
-- (WhatsApp/email) and by campaign guesses off utm_source; this gives it a real
-- column to read.
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT NULL;

-- Backfill from the notes those older leads already carry, so history is not
-- stranded as "unknown" the moment the column starts being written.
UPDATE public.catalog_leads
SET lead_source = substring(notes from 'Contáctenos form \(([^)]+)\)')
WHERE lead_source IS NULL
  AND notes LIKE 'Contáctenos form (%';

CREATE INDEX IF NOT EXISTS catalog_leads_lead_source_idx ON public.catalog_leads (lead_source);
