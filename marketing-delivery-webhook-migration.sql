-- Extend delivery events for asynchronous provider callbacks.
-- Run after marketing-safety-migration.sql.

ALTER TABLE public.marketing_delivery_events
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT;

ALTER TABLE public.marketing_delivery_events
  DROP CONSTRAINT IF EXISTS marketing_delivery_events_status_check;

ALTER TABLE public.marketing_delivery_events
  ADD CONSTRAINT marketing_delivery_events_status_check
  CHECK (status IN ('processing', 'delivered', 'failed', 'suppressed', 'skipped', 'bounced', 'complained'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_delivery_provider_event
  ON public.marketing_delivery_events(provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_delivery_provider_id
  ON public.marketing_delivery_events(provider_id)
  WHERE provider_id IS NOT NULL;
