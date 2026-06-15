-- ============================================================
-- Peptides Costa Rica — Supabase SQL Migrations
-- Run this in the Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- -------------------------------------------------------
-- 1. commission_payouts — add missing columns
-- -------------------------------------------------------

ALTER TABLE public.commission_payouts
  ADD COLUMN IF NOT EXISTS period_label       TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes        TEXT;

-- -------------------------------------------------------
-- 2. Prevent duplicate pending payouts for the same
--    agent + period (re-scanning updates the existing row)
-- -------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payouts_pending_unique
  ON public.commission_payouts (agent_email, start_date, end_date)
  WHERE status = 'Pending';

-- -------------------------------------------------------
-- 3. admin_profiles — salary & commission columns
--    (in case these were not added yet on your DB)
-- -------------------------------------------------------

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS weekly_salary      NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_currency    TEXT      DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS commission_rate    NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_structure TEXT;

-- -------------------------------------------------------
-- Done ✅
-- -------------------------------------------------------
