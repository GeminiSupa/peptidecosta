-- Commission payout deduplication + admin edit fields
-- Run in Supabase SQL Editor

ALTER TABLE public.commission_payouts
  ADD COLUMN IF NOT EXISTS period_label TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- One pending payout per agent per period (prevents duplicate scans)
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payouts_pending_unique
  ON public.commission_payouts (agent_email, start_date, end_date)
  WHERE status = 'Pending';
