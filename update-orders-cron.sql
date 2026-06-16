-- =========================================================================
--                     PEPTIDES COSTA RICA - AUTOMATED FLOWS
-- =========================================================================
-- Run this SQL script in your Supabase Project SQL Editor to update the 
-- orders table to support the automated CRON flows.

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reorder_reminded_at TIMESTAMPTZ;

-- These columns ensure that we only send the automated emails/WhatsApp 
-- messages exactly once per order.
