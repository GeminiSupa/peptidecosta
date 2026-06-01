-- =========================================================================
--               PEPTIDES COSTA RICA - SALES AGENT TAGGING MIGRATION
-- =========================================================================
-- Run this in your Supabase SQL Editor to support tagging sales agents to orders.

-- 1. Add sales_agent column if it does not already exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sales_agent TEXT;

-- 2. Make sure realtime replication is updated for this table to sync immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
