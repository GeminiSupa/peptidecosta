-- Keep the campaign label that won a sale, instead of discarding it.
--
-- orders.campaign_id is a uuid column fed from ?utm_campaign= in the URL. The
-- admin Share Links tab lets anyone type a free-text label there, so values
-- like "tesa15_flash_sale" reach it. sanitizeOrderAttribution() already stops
-- those from breaking the INSERT — but until now it simply dropped them, and
-- the order lost its marketing credit:
--
--   [orders/create] Dropped invalid attribution: campaign_id="tesa15_flash_sale"
--
-- There is nothing to resolve such a label against — email_campaigns has an id
-- and a title, no slug — so it is kept verbatim here instead.
--
-- The insert writes this column defensively (writeDroppingMissingColumns), so
-- checkout keeps working whether or not this file has been run. Running it just
-- means the label is stored rather than logged and lost.
--
-- Safe to re-run.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

CREATE INDEX IF NOT EXISTS orders_utm_campaign_idx
  ON public.orders (utm_campaign, created_at DESC)
  WHERE utm_campaign IS NOT NULL;

-- Sales by campaign label, once this has been collecting for a while:
--
--   SELECT utm_campaign, count(*) AS orders, sum(total_usd) AS usd
--   FROM public.orders
--   WHERE utm_campaign IS NOT NULL
--   GROUP BY utm_campaign
--   ORDER BY orders DESC;
