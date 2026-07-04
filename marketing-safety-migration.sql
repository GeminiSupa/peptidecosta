-- Global channel suppression and per-recipient delivery audit trail.
-- Run this migration in Supabase before using Marketing Studio Safety Center.

CREATE TABLE IF NOT EXISTS public.marketing_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'all')),
  reason TEXT NOT NULL DEFAULT 'manual',
  source TEXT NOT NULL DEFAULT 'admin',
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(identity, channel)
);

CREATE TABLE IF NOT EXISTS public.marketing_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID REFERENCES public.scheduled_broadcasts(id) ON DELETE SET NULL,
  contact_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  status TEXT NOT NULL CHECK (status IN ('processing', 'delivered', 'failed', 'suppressed', 'skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  provider_id TEXT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  UNIQUE(broadcast_id, contact_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_marketing_suppressions_lookup
  ON public.marketing_suppressions(identity, channel) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_marketing_delivery_status
  ON public.marketing_delivery_events(status, last_attempt_at);
CREATE INDEX IF NOT EXISTS idx_marketing_delivery_broadcast
  ON public.marketing_delivery_events(broadcast_id);

ALTER TABLE public.marketing_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages marketing suppressions" ON public.marketing_suppressions;
CREATE POLICY "Service role manages marketing suppressions"
  ON public.marketing_suppressions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages marketing delivery events" ON public.marketing_delivery_events;
CREATE POLICY "Service role manages marketing delivery events"
  ON public.marketing_delivery_events FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.marketing_suppressions TO service_role;
GRANT ALL ON public.marketing_delivery_events TO service_role;
