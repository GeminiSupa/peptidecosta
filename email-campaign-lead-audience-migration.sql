-- Lets a Marketing Studio campaign include CRM lead email addresses in addition
-- to active email subscribers. Safe to run multiple times.

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS include_leads BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
