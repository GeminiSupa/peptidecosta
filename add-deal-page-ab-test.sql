-- Deal of the Week page A/B test: one row per page view, button click and
-- order, tagged with the page version (a or b) the visitor saw.
-- Safe to run more than once. Run it right AFTER the deploy that adds
-- /deal-of-the-week. Until it runs the page still works; the test simply
-- records nothing and Analytics says "Run add-deal-page-ab-test.sql".

CREATE TABLE IF NOT EXISTS public.ab_test_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('a', 'b')),
  event TEXT NOT NULL CHECK (event IN ('view', 'cta_click', 'order')),
  visitor_id TEXT,
  session_id TEXT,
  deal_id TEXT,
  lang TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  order_number TEXT,
  value_usd NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ab_test_events_experiment_time_idx
  ON public.ab_test_events(experiment, created_at DESC);

-- An order is credited to a version once, however many times checkout retries.
CREATE UNIQUE INDEX IF NOT EXISTS ab_test_events_one_order
  ON public.ab_test_events(experiment, order_id)
  WHERE order_id IS NOT NULL;

-- Written and read only by the server (service role). No browser access.
ALTER TABLE public.ab_test_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ab_test_events FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Check it worked (should return one row):
--   SELECT to_regclass('public.ab_test_events');
