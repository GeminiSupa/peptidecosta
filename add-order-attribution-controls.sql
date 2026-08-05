-- Order-level attribution controls for affiliate notifications and commission overrides.
-- Run this in Supabase SQL Editor before relying on the admin order detail controls.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS agent_commission_rate_override NUMERIC,
  ADD COLUMN IF NOT EXISTS agent_commission_source TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_whatsapp_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS affiliate_whatsapp_message_id TEXT;

COMMENT ON COLUMN public.orders.agent_commission_rate_override IS
  'Per-order sales agent commission percentage, stored as whole percent points, e.g. 20 for a self-generated sale.';

COMMENT ON COLUMN public.orders.agent_commission_source IS
  'Reason for the per-order commission override, e.g. self_generated or custom_override.';

CREATE INDEX IF NOT EXISTS idx_orders_agent_commission_override
  ON public.orders(agent_commission_rate_override)
  WHERE agent_commission_rate_override IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_whatsapp_pending
  ON public.orders(affiliate_id, affiliate_whatsapp_notified_at)
  WHERE affiliate_id IS NOT NULL;
