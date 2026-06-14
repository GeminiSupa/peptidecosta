-- Run this in the Supabase SQL Editor to support team salaries and commission structures

ALTER TABLE public.admin_profiles ADD COLUMN IF NOT EXISTS weekly_salary NUMERIC DEFAULT 0;
ALTER TABLE public.admin_profiles ADD COLUMN IF NOT EXISTS salary_currency TEXT DEFAULT 'USD';
ALTER TABLE public.admin_profiles ADD COLUMN IF NOT EXISTS commission_structure TEXT;

ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS weekly_salary_paid NUMERIC DEFAULT 0;
ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS total_payout_usd NUMERIC DEFAULT 0;
ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS total_payout_crc NUMERIC DEFAULT 0;
ALTER TABLE public.commission_payouts ADD COLUMN IF NOT EXISTS salary_currency TEXT DEFAULT 'USD';
