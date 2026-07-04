-- Persistent lifecycle journeys and per-contact progress.
-- Run this migration in Supabase before activating journeys in Marketing Studio.

CREATE TABLE IF NOT EXISTS public.marketing_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  trigger JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_journey_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES public.marketing_journeys(id) ON DELETE CASCADE,
  contact_key TEXT NOT NULL,
  contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped', 'failed')),
  next_run_at TIMESTAMPTZ,
  last_error TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (journey_id, contact_key)
);

CREATE INDEX IF NOT EXISTS idx_marketing_journeys_status
  ON public.marketing_journeys(status);
CREATE INDEX IF NOT EXISTS idx_marketing_enrollments_due
  ON public.marketing_journey_enrollments(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_marketing_enrollments_journey
  ON public.marketing_journey_enrollments(journey_id);

ALTER TABLE public.marketing_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_journey_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages marketing journeys" ON public.marketing_journeys;
CREATE POLICY "Service role manages marketing journeys"
  ON public.marketing_journeys FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages journey enrollments" ON public.marketing_journey_enrollments;
CREATE POLICY "Service role manages journey enrollments"
  ON public.marketing_journey_enrollments FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.marketing_journeys TO service_role;
GRANT ALL ON public.marketing_journey_enrollments TO service_role;
