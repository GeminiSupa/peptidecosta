-- First-class discounts that staff can apply to an existing order.
-- Run this in Supabase SQL Editor before using the admin order discount controls.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS manual_discount_type TEXT,
  ADD COLUMN IF NOT EXISTS manual_discount_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_reason TEXT,
  ADD COLUMN IF NOT EXISTS manual_discount_amount_usd NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_amount_crc NUMERIC NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_manual_discount_type_check
    CHECK (manual_discount_type IS NULL OR manual_discount_type IN ('percentage', 'fixed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_manual_discount_value_check
    CHECK (manual_discount_value >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.orders.manual_discount_type IS
  'Admin-applied order discount mode: percentage, fixed, or null when no manual discount is active.';

COMMENT ON COLUMN public.orders.manual_discount_value IS
  'The percentage points or fixed amount entered by staff, interpreted using the order currency.';

COMMENT ON COLUMN public.orders.manual_discount_reason IS
  'Optional customer-facing reason for an admin-applied order discount.';

NOTIFY pgrst, 'reload schema';
