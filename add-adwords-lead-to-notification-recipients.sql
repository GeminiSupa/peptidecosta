-- Alter public.notification_recipients to separate Google Ads leads from every
-- other lead form.
--
-- new_lead fires for all three forms that post to /api/leads/contact: the Google
-- Ads page at /lp, the /landing page, and the "Contáctenos" form on the catalog.
-- That is fine for the ops inbox, but the campaign is meant to go to one agent,
-- and ticking her onto new_lead would also have sent her every storefront
-- enquiry. A separate flag lets paid traffic reach the person paying attention
-- to it without dragging the rest of the CRM along.
--
-- Not seeded on purpose: who works the campaign is a business decision, and the
-- Team Management screen is where it belongs. Nothing goes quiet in the
-- meantime — getLeadNotificationRecipients falls back to the new_lead list while
-- this one is empty, so alerts keep arriving exactly as they do today until
-- somebody is ticked here deliberately.
ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS adwords_lead BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS notification_recipients_adwords_lead_idx
  ON public.notification_recipients (channel, adwords_lead)
  WHERE active;
