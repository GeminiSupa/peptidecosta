-- Per-channel batch size and wait for one-time announcements.
--
-- The processor sent a hardcoded 10 contacts per run and then re-triggered
-- itself immediately, so a broadcast went out as fast as the two providers
-- would accept it. The two do not want the same pace: WhatsApp marketing is
-- rate-shaped by Meta and a burst is what gets a number flagged, while email
-- is bounded by the daily allowance on the shared Elastic login. One speed
-- could not suit both, and neither was adjustable without a deploy.
--
-- Each channel now carries its own size and delay, plus the timestamp of when
-- it may next send. The row's scheduled_at stays the earlier of the two, so
-- the existing "pick up pending broadcasts" query is unchanged.
--
-- All six are nullable: NULL means "use the built-in default", which is the
-- old behaviour (10 per batch, no wait). Nothing needs backfilling.
--
-- Safe to run more than once. Adds six nullable columns and touches no rows.

ALTER TABLE public.scheduled_broadcasts
  ADD COLUMN IF NOT EXISTS email_batch_size INTEGER,
  ADD COLUMN IF NOT EXISTS email_batch_delay_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS email_next_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_batch_size INTEGER,
  ADD COLUMN IF NOT EXISTS whatsapp_batch_delay_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS whatsapp_next_at TIMESTAMPTZ;

COMMENT ON COLUMN public.scheduled_broadcasts.email_batch_size IS
  'How many emails to send per processor run. NULL uses the built-in default.';
COMMENT ON COLUMN public.scheduled_broadcasts.email_batch_delay_seconds IS
  'Seconds to wait before the next email batch. NULL or 0 sends straight on.';
COMMENT ON COLUMN public.scheduled_broadcasts.email_next_at IS
  'Earliest time the next email batch may go. Set by the processor, not the operator.';
COMMENT ON COLUMN public.scheduled_broadcasts.whatsapp_batch_size IS
  'How many WhatsApp messages to send per processor run. NULL uses the built-in default.';
COMMENT ON COLUMN public.scheduled_broadcasts.whatsapp_batch_delay_seconds IS
  'Seconds to wait before the next WhatsApp batch. NULL or 0 sends straight on.';
COMMENT ON COLUMN public.scheduled_broadcasts.whatsapp_next_at IS
  'Earliest time the next WhatsApp batch may go. Set by the processor, not the operator.';

NOTIFY pgrst, 'reload schema';
