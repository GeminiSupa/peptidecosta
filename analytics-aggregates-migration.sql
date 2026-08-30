-- Analytics aggregation. Paste the whole file into the Supabase SQL editor.
-- Idempotent. Rationale: docs/analytics-aggregates.md

CREATE OR REPLACE FUNCTION public.analytics_overview(
  range_start timestamptz DEFAULT NULL,
  range_end   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH bounds AS (
  -- Resolved to real timestamps rather than left as "or NULL": a
  -- `(range_start IS NULL OR col >= range_start)` predicate is not sargable, so
  -- Postgres ignored every index below and scanned the whole table each call.
  SELECT COALESCE(range_start, '-infinity'::timestamptz) AS lo,
         COALESCE(range_end, now()) AS hi
),

-- Sessions -----------------------------------------------------------------
session_rows AS (
  SELECT s.city, s.device_info, s.catalog_duration
  FROM public.visitor_sessions s, bounds b
  WHERE s.last_active >= b.lo
    AND s.last_active <= b.hi
),
session_stats AS (
  SELECT
    count(*)::bigint AS sessions,
    -- Same test the dashboard applied to the user agent, moved server-side.
    count(*) FILTER (
      WHERE coalesce(device_info, '') ~* '(mobi|android|iphone)'
    )::bigint AS mobile,
    count(*) FILTER (WHERE coalesce(catalog_duration, 0) > 0)::bigint AS with_duration,
    COALESCE(
      avg(catalog_duration) FILTER (WHERE coalesce(catalog_duration, 0) > 0),
      0
    )::numeric AS avg_catalog_seconds
  FROM session_rows
),
city_stats AS (
  SELECT city, count(*)::bigint AS sessions
  FROM session_rows
  WHERE city IS NOT NULL AND btrim(city) <> '' AND city <> 'Unknown'
  GROUP BY city
  ORDER BY 2 DESC
  LIMIT 10
),

-- Product views ------------------------------------------------------------
product_stats AS (
  SELECT
    v.product_name AS name,
    count(*)::bigint AS views,
    count(DISTINCT v.session_id)::bigint AS viewers
  FROM public.product_views v, bounds b
  WHERE v.created_at >= b.lo
    AND v.created_at <= b.hi
    AND v.product_name IS NOT NULL
    AND v.product_name <> 'Unknown'
  GROUP BY v.product_name
  ORDER BY 2 DESC
  LIMIT 200
),

-- Analytics events ---------------------------------------------------------
-- Localhost and preview deploys are excluded here for the same reason the
-- dashboard excluded them: they are our own traffic.
prod_events AS (
  SELECT
    lower(coalesce(e.hostname, '')) AS host,
    COALESCE(
      NULLIF(btrim(e.visitor_id), ''),
      NULLIF(btrim(e.session_id), ''),
      e.id::text
    ) AS identity,
    CASE
      WHEN split_part(split_part(coalesce(e.path, '/'), '?', 1), '#', 1) LIKE '/%'
        THEN split_part(split_part(coalesce(e.path, '/'), '?', 1), '#', 1)
      ELSE '/'
    END AS path,
    lower(coalesce(e.event_type, '')) AS event_type,
    e.utm_source,
    e.created_at,
    (NULLIF(btrim(coalesce(e.gclid, '')), '') IS NOT NULL
     OR NULLIF(btrim(coalesce(e.fbclid, '')), '') IS NOT NULL) AS paid
  FROM public.analytics_events e, bounds b
  WHERE e.created_at >= b.lo
    AND e.created_at <= b.hi
    AND lower(coalesce(e.hostname, '')) <> 'localhost'
    AND lower(coalesce(e.hostname, '')) NOT LIKE '%.vercel.app'
),
page_views AS (
  SELECT * FROM prod_events WHERE event_type = 'page_view' AND host <> ''
),
domain_stats AS (
  SELECT
    host AS hostname,
    count(*)::bigint AS page_views,
    count(DISTINCT identity)::bigint AS visitors,
    count(DISTINCT identity) FILTER (WHERE paid)::bigint AS paid_visitors
  FROM page_views
  GROUP BY host
  ORDER BY 3 DESC, 2 DESC
  LIMIT 50
),
page_stats AS (
  SELECT
    host AS hostname,
    path,
    count(*)::bigint AS page_views,
    count(DISTINCT identity)::bigint AS visitors,
    count(DISTINCT identity) FILTER (WHERE paid)::bigint AS paid_visitors
  FROM page_views
  GROUP BY host, path
  ORDER BY 4 DESC, 3 DESC
  LIMIT 100
),
-- A visitor's channel is their most recent utm_source, which is the one the
-- dashboard picked when it read the array newest-first.
visitor_channel AS (
  SELECT DISTINCT ON (identity) identity, utm_source
  FROM prod_events
  ORDER BY identity, created_at DESC
),
channel_stats AS (
  SELECT coalesce(utm_source, '') AS utm_source, count(*)::bigint AS visitors
  FROM visitor_channel
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 50
),
landing_stats AS (
  SELECT count(DISTINCT identity)::bigint AS visitors
  FROM page_views
  WHERE path = '/lp' OR path LIKE '/lp/%'
)

SELECT jsonb_build_object(
  'sessions', jsonb_build_object(
    'total', (SELECT sessions FROM session_stats),
    'mobile', (SELECT mobile FROM session_stats),
    'withDuration', (SELECT with_duration FROM session_stats),
    'avgCatalogSeconds', round((SELECT avg_catalog_seconds FROM session_stats), 2)
  ),
  'cities', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('city', city, 'sessions', sessions))
    FROM city_stats
  ), '[]'::jsonb),
  'productViews', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', name, 'views', views, 'viewers', viewers))
    FROM product_stats
  ), '[]'::jsonb),
  'domains', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'hostname', hostname, 'pageViews', page_views,
      'visitors', visitors, 'paidVisitors', paid_visitors))
    FROM domain_stats
  ), '[]'::jsonb),
  'pages', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'hostname', hostname, 'path', path, 'pageViews', page_views,
      'visitors', visitors, 'paidVisitors', paid_visitors))
    FROM page_stats
  ), '[]'::jsonb),
  'channels', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('utmSource', utm_source, 'visitors', visitors))
    FROM channel_stats
  ), '[]'::jsonb),
  'landingVisitors', (SELECT visitors FROM landing_stats)
);
$$;

-- The grouped scans above are the whole point, so give them indexes to group on.
CREATE INDEX IF NOT EXISTS visitor_sessions_last_active_idx
  ON public.visitor_sessions (last_active DESC);
CREATE INDEX IF NOT EXISTS product_views_created_at_idx
  ON public.product_views (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_hostname_created_idx
  ON public.analytics_events (hostname, created_at DESC);
-- The page-view aggregates filter on event_type before grouping, and the
-- product aggregate groups by name inside a date range.
CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx
  ON public.analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS product_views_name_created_idx
  ON public.product_views (product_name, created_at DESC);

-- "All time" has no range to narrow on, so it reads every row by definition.
-- The default statement timeout would cancel it and cost the tab its exact
-- figures; this bounds it generously instead of leaving it to chance.
ALTER FUNCTION public.analytics_overview(timestamptz, timestamptz)
  SET statement_timeout = '55s';

REVOKE ALL ON FUNCTION public.analytics_overview(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_overview(timestamptz, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
