-- Journey-specific engagement and direct order attribution.

ALTER TABLE public.scheduled_broadcasts
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES public.marketing_journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journey_enrollment_id UUID REFERENCES public.marketing_journey_enrollments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journey_step_id TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES public.marketing_journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journey_enrollment_id UUID REFERENCES public.marketing_journey_enrollments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journey_step_id TEXT;

CREATE TABLE IF NOT EXISTS public.journey_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_hash TEXT NOT NULL UNIQUE,
  journey_id UUID NOT NULL REFERENCES public.marketing_journeys(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.marketing_journey_enrollments(id) ON DELETE SET NULL,
  broadcast_id UUID REFERENCES public.scheduled_broadcasts(id) ON DELETE SET NULL,
  step_id TEXT,
  contact_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'click')),
  target_url TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journey_engagement_journey
  ON public.journey_engagement_events(journey_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_journey
  ON public.orders(journey_id) WHERE journey_id IS NOT NULL;

ALTER TABLE public.journey_engagement_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages journey engagement" ON public.journey_engagement_events;
CREATE POLICY "Service role manages journey engagement"
  ON public.journey_engagement_events FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.journey_engagement_events TO service_role;
