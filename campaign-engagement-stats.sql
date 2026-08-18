-- Open and click rates were computed from raw event rows.
--
-- Both trackers insert one row per event, so a subscriber who opens a campaign
-- five times counted as five opens, and Apple Mail Privacy Protection prefetches
-- the pixel for every iOS recipient whether or not a human looked. Worse, mail
-- clients that block images still follow links, so clicks routinely exceeded
-- opens and the dashboard printed a click rate above 100%.
--
-- This view counts distinct subscribers alongside the raw totals so the studio
-- can report a rate that means what the word means. Totals are kept because
-- "how many times was this clicked" is still a real question — it is just not
-- a rate.
--
-- The event tables name their timestamps after their own verb — sent_at,
-- opened_at, clicked_at — not created_at like the rest of the schema.
--
-- Safe to run more than once.

CREATE OR REPLACE VIEW public.campaign_engagement_stats
WITH (security_invoker = on) AS
SELECT
  c.id                                  AS campaign_id,
  COALESCE(s.total, 0)::bigint          AS sends,
  COALESCE(s.unique_total, 0)::bigint   AS unique_sends,
  COALESCE(o.total, 0)::bigint          AS total_opens,
  COALESCE(o.unique_total, 0)::bigint   AS unique_opens,
  COALESCE(k.total, 0)::bigint          AS total_clicks,
  COALESCE(k.unique_total, 0)::bigint   AS unique_clicks
FROM public.email_campaigns c
LEFT JOIN (
  SELECT campaign_id, COUNT(*) AS total, COUNT(DISTINCT subscriber_id) AS unique_total
  FROM public.campaign_sends GROUP BY campaign_id
) s ON s.campaign_id = c.id
LEFT JOIN (
  SELECT campaign_id, COUNT(*) AS total, COUNT(DISTINCT subscriber_id) AS unique_total
  FROM public.campaign_opens GROUP BY campaign_id
) o ON o.campaign_id = c.id
LEFT JOIN (
  SELECT campaign_id, COUNT(*) AS total, COUNT(DISTINCT subscriber_id) AS unique_total
  FROM public.campaign_clicks GROUP BY campaign_id
) k ON k.campaign_id = c.id;

-- Which link earned the click. target_url has been recorded on every click
-- since tracking shipped and has never been shown to anyone.
CREATE OR REPLACE VIEW public.campaign_link_clicks
WITH (security_invoker = on) AS
SELECT
  campaign_id,
  target_url,
  COUNT(*)::bigint                     AS clicks,
  COUNT(DISTINCT subscriber_id)::bigint AS unique_clicks,
  MAX(clicked_at)                      AS last_clicked_at
FROM public.campaign_clicks
WHERE target_url IS NOT NULL
GROUP BY campaign_id, target_url;

GRANT SELECT ON public.campaign_engagement_stats TO service_role, authenticated;
GRANT SELECT ON public.campaign_link_clicks      TO service_role, authenticated;

-- The dashboard and the campaign detail view both filter by campaign_id, and
-- the distinct counts scan the whole event table without these.
CREATE INDEX IF NOT EXISTS campaign_opens_campaign_subscriber_idx
  ON public.campaign_opens (campaign_id, subscriber_id);
CREATE INDEX IF NOT EXISTS campaign_clicks_campaign_subscriber_idx
  ON public.campaign_clicks (campaign_id, subscriber_id);
CREATE INDEX IF NOT EXISTS campaign_clicks_campaign_target_idx
  ON public.campaign_clicks (campaign_id, target_url);

NOTIFY pgrst, 'reload schema';
