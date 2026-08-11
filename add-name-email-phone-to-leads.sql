-- A lead could only ever hold ONE contact point: `contact_value`, tagged by
-- `contact_method`. Live chat collects name, email AND phone, and the admin
-- save_lead route has always tried to write all three -- but it routes the
-- write through writeDroppingMissingColumns(), which silently drops any column
-- the table does not have. With no name/email/phone columns, every visitor who
-- gave both an email and a phone landed in the CRM with one of them missing.
--
-- Adding the columns is all that is needed; the application code already
-- populates them. Safe to run more than once.

ALTER TABLE public.catalog_leads
  ADD COLUMN IF NOT EXISTS name  TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Backfill what earlier chats could only park in the notes blob, which looks
-- like:
--   Lead captured from website live chat.
--   Name: Alex Jimenez
--   Email: aljiracr@gmail.com
--   Phone: +506 70195752
UPDATE public.catalog_leads
SET name = NULLIF(TRIM(SUBSTRING(notes FROM 'Name:[ \t]*([^\n\r]+)')), '')
WHERE name IS NULL
  AND notes ~ 'Name:[ \t]*[^\n\r]';

UPDATE public.catalog_leads
SET email = LOWER(NULLIF(TRIM(SUBSTRING(notes FROM 'Email:[ \t]*([^\n\r]+)')), ''))
WHERE email IS NULL
  AND notes ~ 'Email:[ \t]*[^\n\r]';

UPDATE public.catalog_leads
SET phone = NULLIF(REGEXP_REPLACE(COALESCE(SUBSTRING(notes FROM 'Phone:[ \t]*([^\n\r]+)'), ''), '\D', '', 'g'), '')
WHERE phone IS NULL
  AND notes ~ 'Phone:[ \t]*[^\n\r]';

-- The contact point the row already carries belongs in its own column too, so
-- searching by email or phone finds the lead either way.
UPDATE public.catalog_leads
SET email = LOWER(TRIM(contact_value))
WHERE email IS NULL
  AND contact_value LIKE '%@%';

UPDATE public.catalog_leads
SET phone = REGEXP_REPLACE(contact_value, '\D', '', 'g')
WHERE phone IS NULL
  AND contact_value NOT LIKE '%@%'
  AND LENGTH(REGEXP_REPLACE(contact_value, '\D', '', 'g')) >= 8;

CREATE INDEX IF NOT EXISTS idx_catalog_leads_email ON public.catalog_leads (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_leads_phone ON public.catalog_leads (phone) WHERE phone IS NOT NULL;

NOTIFY pgrst, 'reload schema';
