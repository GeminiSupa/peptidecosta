-- Alter public.catalog_leads to record when a lead last submitted an enquiry form.
--
-- /api/leads/contact dedupes on contact_value, so a visitor who is already in
-- the CRM updates their existing row instead of creating a new one. The Leads
-- tab sorts by created_at, so that fresh enquiry stayed filed under the original
-- contact date and an agent scanning the top of the list never saw it. This
-- separates "when we first met them" (created_at) from "when they last asked us
-- something" (last_enquiry_at) so the tab can sort on the second.
--
-- Backfilled from created_at so existing leads keep their current order rather
-- than sinking below every new arrival.
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS last_enquiry_at TIMESTAMPTZ DEFAULT NULL;

UPDATE public.catalog_leads SET last_enquiry_at = created_at WHERE last_enquiry_at IS NULL;
