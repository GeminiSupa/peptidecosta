-- review_asks: one row per review request, per customer.
--
-- WHY
-- Review requests were deduplicated per ORDER (orders.review_requested_at), so
-- a repeat customer was asked again on every purchase, often for the same site
-- they had already reviewed. The unit has to be the customer, and the history
-- has to survive across orders, so it lives here rather than on the order.
--
-- clicked_platform is the strongest signal available: a click on our own
-- Google/Facebook button is visible, a click on a Trustpilot invitation is not
-- (Trustpilot sends that email), and an actual review is never visible anywhere.
--
-- SAFE TO RUN BEFORE OR AFTER THE DEPLOY. Without it, review history cannot be
-- read and every customer looks new — the code treats a failed history lookup
-- as "do not ask", so the failure is a quiet pause, never a double-ask.
--
-- Run in: Supabase dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS public.review_asks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email   text NOT NULL,           -- always lower-cased and trimmed
  order_id         text,
  order_number     text,
  platforms        text[] NOT NULL,         -- what was offered: trustpilot | google | facebook
  asked_at         timestamptz NOT NULL DEFAULT now(),
  clicked_platform text,                    -- google | facebook, never trustpilot
  clicked_at       timestamptz
);

-- Every read is "this customer's asks, newest first".
CREATE INDEX IF NOT EXISTS review_asks_customer_idx
  ON public.review_asks (customer_email, asked_at DESC);

-- Server-side only: the completion route, the cron and the click redirect all
-- use the service role, which bypasses RLS. Enabling it with no policy means
-- nobody else can read or write it, including with the public key.
ALTER TABLE public.review_asks ENABLE ROW LEVEL SECURITY;

-- Backfill from the invitations already sent, so existing customers are not
-- treated as never-asked and immediately asked again. Everything sent before
-- the split went to Trustpilot; anything already marked 'google' came from the
-- cron. No click data exists for any of it, which is correct - none was ever
-- recorded.
INSERT INTO public.review_asks (customer_email, order_id, order_number, platforms, asked_at)
SELECT lower(trim(o.customer_email)),
       o.id::text,
       o.order_number,
       CASE WHEN o.review_platform = 'google'
            THEN ARRAY['google','facebook']
            ELSE ARRAY['trustpilot'] END,
       o.review_requested_at
  FROM public.orders o
 WHERE o.review_requested_at IS NOT NULL
   AND o.customer_email IS NOT NULL
   AND trim(o.customer_email) <> ''
   AND NOT EXISTS (
         SELECT 1 FROM public.review_asks r
          WHERE r.order_id = o.id::text
       );

-- Verify:
--   SELECT COUNT(*) FROM public.review_asks;
--   SELECT COUNT(DISTINCT customer_email) FROM public.review_asks;
--   -- customers asked more than once (should be few, and only repeat buyers):
--   SELECT customer_email, COUNT(*) FROM public.review_asks
--   GROUP BY customer_email HAVING COUNT(*) > 1 ORDER BY 2 DESC LIMIT 10;
