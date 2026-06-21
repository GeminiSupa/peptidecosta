-- =========================================================================
--               PEPTIDES COSTA RICA - SALE SCHEDULING MIGRATION
-- =========================================================================
-- Run this script in your Supabase SQL Editor to add sale scheduling to the products table.

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS sale_start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sale_end_time TIMESTAMPTZ;
