-- Refunds: recording money given back, and clawing back the commission on it.
--
-- Refunds are issued BY HAND in Shield Hub Pay. Nothing here moves money. This
-- records what was given back so the order, the agent's pay and the accountant's
-- books all agree about it.
--
-- Run this whole file in the Supabase SQL editor before deploying the refund UI.
-- Everything is IF NOT EXISTS, so running it twice is harmless.

-- ---------------------------------------------------------------------------
-- 1. What has been refunded on an order
-- ---------------------------------------------------------------------------
-- Cumulative, not per-refund: an order can be refunded more than once, and the
-- guard that stops $100 paid becoming $110 refunded has to compare against the
-- running total, never against a single event.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_amount_usd NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_amount_crc NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_reason TEXT;

-- Every individual refund event, so a partly-refunded order can be read back as
-- the sequence it actually was rather than one running total with no history.
-- [{ amount_usd, amount_crc, reason, by, at, stock_restored }]
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_events JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_refunded_at ON public.orders(refunded_at);

-- ---------------------------------------------------------------------------
-- 2. Commission owed back by an agent
-- ---------------------------------------------------------------------------
-- When an order is refunded BEFORE the agent has been paid for it, nothing is
-- needed here: the weekly scan simply stops counting it, because a refunded
-- status is not commission-eligible.
--
-- When the agent has ALREADY been paid, the commission has left the building.
-- That debt is recorded here and taken off their next weekly pay.
--
-- `applied_*` is what has been recovered so far, which is what makes carrying
-- forward possible: a quiet week recovers what it can, the payslip never goes
-- negative, and the remainder waits for the following week.
CREATE TABLE IF NOT EXISTS public.commission_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_email TEXT NOT NULL,
    agent_name TEXT,
    order_number TEXT NOT NULL,
    -- One debt expressed in two currencies, exactly as payouts are. These are
    -- the same money twice — never add them together.
    amount_usd NUMERIC NOT NULL DEFAULT 0,
    amount_crc NUMERIC NOT NULL DEFAULT 0,
    applied_usd NUMERIC NOT NULL DEFAULT 0,
    applied_crc NUMERIC NOT NULL DEFAULT 0,
    reason TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commission_adjustments_agent ON public.commission_adjustments(agent_email);
-- The weekly run asks "what does this agent still owe?", so the open ones are
-- the hot path.
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_open ON public.commission_adjustments(agent_email) WHERE settled_at IS NULL;
-- One debt per order per agent; a second refund on the same order tops up the
-- existing row rather than creating a rival one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_adjustments_order ON public.commission_adjustments(agent_email, order_number);

ALTER TABLE public.commission_adjustments ENABLE ROW LEVEL SECURITY;

-- Admin-only, matching commission_payouts. Every write goes through the
-- service-role key in an authenticated route, so no permissive policy is needed
-- for the app itself.
DROP POLICY IF EXISTS commission_adjustments_admin_all ON public.commission_adjustments;
CREATE POLICY commission_adjustments_admin_all
ON public.commission_adjustments FOR ALL TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- 3. What a payout actually recovered
-- ---------------------------------------------------------------------------
-- Written onto the payout so the payslip can name the orders it deducted for.
-- "Your pay is lower this week" with no explanation is how an agent loses trust
-- in the number.
ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS adjustment_usd NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS adjustment_crc NUMERIC NOT NULL DEFAULT 0;
-- [{ order_number, amount_usd, amount_crc, reason }]
ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS adjustments_data JSONB NOT NULL DEFAULT '[]'::jsonb;
-- What is still owed after this payout, carried into the next one.
ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS adjustment_carried_usd NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS adjustment_carried_crc NUMERIC NOT NULL DEFAULT 0;
