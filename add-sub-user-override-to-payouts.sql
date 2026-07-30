-- =========================================================================
--        PEPTIDES COSTA RICA - SUB-USER OVERRIDE ON COMMISSION PAYOUTS
-- =========================================================================
-- Run this in your Supabase SQL Editor after add-sub-user-tier.sql.
-- Safe to re-run.
--
-- A staff member earns a 2% override on orders her sub-users bring. That is
-- stored as its own labelled component rather than folded into usd_commission,
-- for two reasons:
--   1. her statement email can explain where the number came from
--   2. an approved payout keeps a record of WHICH orders produced the override,
--      which is what stops the next weekly scan paying it a second time
--
-- override_orders_data matters more than it looks. weekly-report skips orders
-- that already appear in an approved payout. One sub-user order legitimately
-- pays two people, so the parent's copy has to be recorded separately from the
-- sub-user's own orders_data, and the skip has to be keyed per agent.

ALTER TABLE public.commission_payouts
  ADD COLUMN IF NOT EXISTS override_usd         NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_crc         NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_rate        NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_sales_usd   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_sales_crc   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_orders_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 'staff' or 'sub_user', copied at scan time so a payout row still reads
  -- correctly if the person's tier changes later.
  ADD COLUMN IF NOT EXISTS agent_tier           TEXT NOT NULL DEFAULT 'staff';

-- Existing payout rows predate the tier, so they are all plain staff rows with
-- no override. The defaults above already say that; this is just explicit.
UPDATE public.commission_payouts
SET agent_tier = 'staff'
WHERE agent_tier IS NULL;

-- The weekly scan reads approved payouts per agent to build the "already paid"
-- index. Without this it is a full table scan every Monday.
CREATE INDEX IF NOT EXISTS idx_commission_payouts_agent_status
  ON public.commission_payouts (agent_email, status);

-- -------------------------------------------------------------------------
-- Verify
-- -------------------------------------------------------------------------
--   SELECT agent_name, agent_tier, usd_commission, override_usd, total_payout_usd
--   FROM public.commission_payouts
--   ORDER BY created_at DESC LIMIT 10;
