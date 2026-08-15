-- First-party, cross-domain analytics for the marketing site and catalog.
-- Additive and safe to re-run. Existing visitor_sessions rows are preserved.

ALTER TABLE public.visitor_sessions
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS hostname TEXT,
  ADD COLUMN IF NOT EXISTS current_path TEXT,
  ADD COLUMN IF NOT EXISTS page_title TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS gclid TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_source TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_source TEXT,
  ADD COLUMN IF NOT EXISTS known_customer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cart_items INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS visitor_sessions_last_active_idx
  ON public.visitor_sessions(last_active DESC);
CREATE INDEX IF NOT EXISTS visitor_sessions_visitor_id_idx
  ON public.visitor_sessions(visitor_id, last_active DESC)
  WHERE visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS visitor_sessions_current_path_idx
  ON public.visitor_sessions(hostname, current_path, last_active DESC);
CREATE INDEX IF NOT EXISTS visitor_sessions_known_customer_idx
  ON public.visitor_sessions(known_customer, last_active DESC);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  hostname TEXT,
  path TEXT,
  page_title TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  gclid TEXT,
  fbclid TEXT,
  known_customer BOOLEAN NOT NULL DEFAULT false,
  ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_idx
  ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx
  ON public.analytics_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_path_idx
  ON public.analytics_events(hostname, path, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_source_idx
  ON public.analytics_events(utm_source, utm_campaign, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Browsers now write through /api/analytics/track. They must never be able to
-- read IP-bearing sessions or other visitors' journeys directly.
DROP POLICY IF EXISTS "Allow public insert/update to visitor_sessions" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Allow authenticated read to visitor_sessions" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Authenticated staff read visitor sessions" ON public.visitor_sessions;
CREATE POLICY "Authenticated staff read visitor sessions"
  ON public.visitor_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated staff read analytics events" ON public.analytics_events;
CREATE POLICY "Authenticated staff read analytics events"
  ON public.analytics_events FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE public.visitor_sessions FROM anon;
REVOKE ALL ON TABLE public.analytics_events FROM anon;
GRANT SELECT ON TABLE public.visitor_sessions TO authenticated;
GRANT SELECT ON TABLE public.analytics_events TO authenticated;
GRANT ALL ON TABLE public.visitor_sessions TO service_role;
GRANT ALL ON TABLE public.analytics_events TO service_role;

NOTIFY pgrst, 'reload schema';
