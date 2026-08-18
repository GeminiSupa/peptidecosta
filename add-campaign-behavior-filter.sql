-- Campaign targeting was tags plus the four audience scopes, and nothing else.
-- That cannot express the first segment anybody actually wants — the people
-- who still read the mail — so every campaign went to the whole list and
-- re-engagement sends had no way to find the quiet half.
--
--   none        no behavioural filter (the previous behaviour)
--   engaged     opened or clicked in the last 90 days
--   clicked     clicked a link in the last 90 days
--   dormant     no open or click in 180 days, including never — for win-back
--   customers   at least one order on the address
--   prospects   on the list, no order yet
--
-- The filter only ever narrows the chosen audience scope; it can never add
-- somebody the scope excluded. Defaults to 'none' so existing campaigns keep
-- sending to exactly who they did before.
--
-- Safe to run more than once.

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS behavior_filter TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  ALTER TABLE public.email_campaigns
    ADD CONSTRAINT email_campaigns_behavior_filter_check
    CHECK (behavior_filter IN ('none', 'engaged', 'clicked', 'dormant', 'customers', 'prospects'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The send resolves this by walking open/click history per address.
CREATE INDEX IF NOT EXISTS campaign_opens_subscriber_created_idx
  ON public.campaign_opens (subscriber_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_clicks_subscriber_created_idx
  ON public.campaign_clicks (subscriber_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
