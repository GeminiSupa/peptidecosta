-- Keep the reason a WhatsApp message failed, not just the fact that it did.
--
-- Meta's status webhook carries an errors[] array naming the cause — 131047
-- (outside the 24-hour window), 132001 (template not approved in that
-- language), 131026 (number not on WhatsApp). The webhook was writing
-- delivery_status = 'failed' and discarding all of it, while the sender had
-- already logged "sent successfully". A customer order confirmation could fail
-- every time and leave nothing anyone could find.
--
-- The code writes this column defensively (writeDroppingMissingColumns), so it
-- keeps working whether or not this file has been run — running it just means
-- the reason is stored as well as logged.
--
-- Safe to re-run.

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;

-- Failures are the only rows anyone goes looking for, and they are a small
-- fraction of the table.
CREATE INDEX IF NOT EXISTS whatsapp_messages_delivery_error_idx
  ON public.whatsapp_messages (created_at DESC)
  WHERE delivery_error IS NOT NULL;

-- Recent failures, once this has been running for a while:
--
--   SELECT created_at, wa_id, delivery_status, delivery_error
--   FROM public.whatsapp_messages
--   WHERE delivery_error IS NOT NULL
--   ORDER BY created_at DESC
--   LIMIT 50;
