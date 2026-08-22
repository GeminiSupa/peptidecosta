-- Weekly Deal process reliability and attribution.
--
-- Run once in the Supabase SQL Editor after add-deal-of-the-week.sql.
-- Safe to re-run. The application remains checkout-safe before this is run,
-- but durable announcement status and per-deal order reporting require it.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS applied JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS announcement_drafts JSONB,
  ADD COLUMN IF NOT EXISTS announcement_status TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS broadcast_id UUID;

ALTER TABLE public.scheduled_broadcasts
  ADD COLUMN IF NOT EXISTS deal_id UUID;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deal_id UUID;

-- Re-running this file must not duplicate foreign keys. Constraint existence is
-- checked by name because PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deals_broadcast_id_fkey'
      AND conrelid = 'public.deals'::regclass
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_broadcast_id_fkey
      FOREIGN KEY (broadcast_id)
      REFERENCES public.scheduled_broadcasts(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scheduled_broadcasts_deal_id_fkey'
      AND conrelid = 'public.scheduled_broadcasts'::regclass
  ) THEN
    ALTER TABLE public.scheduled_broadcasts
      ADD CONSTRAINT scheduled_broadcasts_deal_id_fkey
      FOREIGN KEY (deal_id)
      REFERENCES public.deals(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_deal_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_deal_id_fkey
      FOREIGN KEY (deal_id)
      REFERENCES public.deals(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_announcement_status_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_announcement_status_check
  CHECK (announcement_status IN (
    'not_sent', 'scheduled', 'queued', 'sending', 'completed', 'failed', 'cancelled'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_broadcast_id
  ON public.deals(broadcast_id)
  WHERE broadcast_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_deal_id
  ON public.scheduled_broadcasts(deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_deal_id_created_at
  ON public.orders(deal_id, created_at DESC)
  WHERE deal_id IS NOT NULL;

-- Deal baselines contain internal shelf-price history. The admin API uses the
-- service role, so authenticated browser sessions do not need direct access.
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access to deals" ON public.deals;
DROP POLICY IF EXISTS "Allow authenticated read to deals" ON public.deals;

