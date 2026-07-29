-- =========================================================================
--        PEPTIDES COSTA RICA - DB-BACKED USD/CRC EXCHANGE RATE
-- =========================================================================
-- Run this in your Supabase SQL Editor.
--
-- The public catalog, admin, bots, and any other website reading Supabase
-- should use the same USD -> CRC value. The app stores that value in
-- site_settings.exchange_rate and refreshes products.price_crc from it.

CREATE TABLE IF NOT EXISTS public.site_settings (
    id TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to settings" ON public.site_settings;
DROP POLICY IF EXISTS "Allow authenticated write access to settings" ON public.site_settings;

CREATE POLICY "Allow public read access to settings"
ON public.site_settings FOR SELECT USING (true);

CREATE POLICY "Allow authenticated write access to settings"
ON public.site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.site_settings (id, value, updated_at)
VALUES (
  'exchange_rate',
  jsonb_build_object(
    'base', 'USD',
    'quote', 'CRC',
    'usd_crc', 454.48,
    'source', 'migration-default',
    'fetched_at', now()
  ),
  now()
)
ON CONFLICT (id) DO NOTHING;

WITH current_rate AS (
  SELECT COALESCE((value->>'usd_crc')::numeric, 454.48) AS usd_crc
  FROM public.site_settings
  WHERE id = 'exchange_rate'
),
product_prices AS (
  SELECT
    p.id,
    NULLIF(regexp_replace(COALESCE(p.price_usd, ''), '[^0-9.]', '', 'g'), '')::numeric AS price_usd_num,
    NULLIF(regexp_replace(COALESCE(p.original_price_usd, ''), '[^0-9.]', '', 'g'), '')::numeric AS original_price_usd_num,
    r.usd_crc
  FROM public.products p
  CROSS JOIN current_rate r
)
UPDATE public.products p
SET
  price_crc = CASE
    WHEN pp.price_usd_num IS NULL THEN p.price_crc
    ELSE '₡' || to_char(round(pp.price_usd_num * pp.usd_crc), 'FM999,999,999,999')
  END,
  original_price_crc = CASE
    WHEN pp.original_price_usd_num IS NULL THEN NULL
    ELSE '₡' || to_char(round(pp.original_price_usd_num * pp.usd_crc), 'FM999,999,999,999')
  END
FROM product_prices pp
WHERE p.id = pp.id;
