-- Deal of the Week: one promotion per week, ending Sunday midnight Costa Rica.
--
-- Run once in the Supabase SQL Editor BEFORE deploying the code.
-- Safe to re-run.
--
-- A deal is a SCHEDULED PRICE MARKDOWN, not a promo code. products.price_usd is
-- the single source of truth every pricing path reads — the catalog cart, order
-- creation, the WhatsApp receipt and src/lib/pricing.js for bot checkout links —
-- so lowering it applies the deal everywhere with no per-path discount math to
-- keep in sync, and with nothing for the customer to type. The automatic volume
-- discount then compounds on top of the marked-down price, which is the same
-- total the equivalent stacking promo code produced (0.85 x 0.80 = 0.68 of list).
--
-- baseline is the reason this table exists. Marking a product down overwrites
-- columns that already hold data, and the catalog will happily keep charging a
-- marked-down price forever: once sale_end_time passes it stops rendering the
-- ribbon but never restores price_usd. So the pre-deal values are snapshotted
-- here and replayed on expiry. It also makes a second launch over a live deal
-- safe — the markdown is always computed from the baseline, never from the
-- already-discounted shelf price, so 15% twice can never become 28%.

CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Customer-facing copy. EN is authoritative; ES falls back to it when blank.
    title_en TEXT,
    title_es TEXT,

    -- Product names exactly as they appear in products.product. An array rather
    -- than the comma-joined string promo_codes.target_product uses, because that
    -- format cannot represent a product whose name contains a comma.
    product_names TEXT[] NOT NULL DEFAULT '{}',

    -- Stored as a fraction (0.15), matching promo_codes.discount_pct.
    discount_pct NUMERIC NOT NULL,

    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,

    -- draft  → created but prices untouched
    -- live   → prices marked down right now
    -- ended  → prices restored from baseline
    status TEXT NOT NULL DEFAULT 'draft',

    -- Per-product pre-deal values, keyed by product id:
    --   { "<uuid>": { "product": "GHK-Cu", "price_usd": "...",
    --                 "original_price_usd": null, "original_price_crc": null,
    --                 "discount": "...", "sale_start_time": null,
    --                 "sale_end_time": null } }
    -- discount is included because that column doubles as the free-text
    -- "Volume/Bulk Discount Info" shown in the Products tab, and the catalog
    -- also reads it as the on/off gate for a sale window. Launching a deal
    -- overwrites it, so it has to come back.
    baseline JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Ties the site banner to the deal so expiry takes the banner down with it.
    -- Matches the `id` of an entry in site_settings.announcement_banners.
    banner_id TEXT,

    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ
);

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_status_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_status_check
  CHECK (status IN ('draft', 'live', 'ended'));

-- A deal that gives away everything, or nothing, is a mistake not an offer.
ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_discount_pct_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_discount_pct_check
  CHECK (discount_pct > 0 AND discount_pct < 1);

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_window_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_window_check
  CHECK (ends_at > starts_at);

-- Two live deals would fight over the same product's price column and each
-- other's baseline. Only one deal runs at a time, enforced here rather than by
-- the API alone so a retried request cannot slip a second one through.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_single_live
  ON public.deals((status))
  WHERE status = 'live';

-- The expiry cron asks "any live deal past its end?" every hour.
CREATE INDEX IF NOT EXISTS idx_deals_live_ends_at
  ON public.deals(ends_at)
  WHERE status = 'live';

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- No public policy at all. Customers see a deal through the marked-down
-- products row and the banner, both already public — they never need to read
-- this table, and baseline prices are internal. Every write goes through
-- /api/admin/deals with the service role, which bypasses RLS.
DROP POLICY IF EXISTS "Allow public read access to deals" ON public.deals;
DROP POLICY IF EXISTS "Allow authenticated read to deals" ON public.deals;

CREATE POLICY "Allow authenticated read to deals"
ON public.deals FOR SELECT
TO authenticated
USING (true);
