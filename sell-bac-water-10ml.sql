-- Restore the 10ml BAC water listing as a three-vial pack for $20 total.
-- The storefront treats one cart unit as one pack; single vials are not sold.

UPDATE public.products
SET
  price_usd = '$20',
  price_crc = '₡' || to_char(
    round(
      20 * COALESCE(
        (SELECT (value->>'usd_crc')::numeric FROM public.site_settings WHERE id = 'exchange_rate'),
        454.48
      )
    ),
    'FM999,999,999,999'
  ),
  discount = NULL,
  status = 'In Stock'
WHERE lower(product) = 'bac water 10ml';

UPDATE public.site_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{names}',
  COALESCE(
    (
      SELECT jsonb_agg(entry.name)
      FROM jsonb_array_elements_text(COALESCE(value->'names', '[]'::jsonb)) AS entry(name)
      WHERE lower(entry.name) <> 'bac water 10ml'
    ),
    '[]'::jsonb
  )
)
WHERE id = 'hidden_products';
