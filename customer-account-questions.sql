-- Who a customer account is for.
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- This is the only new SQL the customer accounts need.
-- Deal names, promo codes and savings are already stored on each order,
-- so the account can show them without another column.
-- Deleting a login uses the account tables that already exist. Orders stay.

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS account_kind TEXT,
  ADD COLUMN IF NOT EXISTS organization_name TEXT;

ALTER TABLE public.customer_profiles
  DROP CONSTRAINT IF EXISTS customer_profiles_account_kind_check;

ALTER TABLE public.customer_profiles
  ADD CONSTRAINT customer_profiles_account_kind_check
  CHECK (
    account_kind IS NULL
    OR account_kind IN ('researcher', 'pharmacy', 'clinic', 'other')
  );
