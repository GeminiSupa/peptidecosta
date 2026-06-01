-- =========================================================================
--               PEPTIDES COSTA RICA - COMMISSION SCHEMAS
-- =========================================================================
-- Run this in your Supabase SQL Editor.

-- Add commission_rate column if it does not already exist
ALTER TABLE public.admin_profiles ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 0;
