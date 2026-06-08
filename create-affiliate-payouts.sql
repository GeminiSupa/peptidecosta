-- =========================================================================
--               PEPTIDES COSTA RICA - AFFILIATE PAYOUTS SCHEMAS
-- =========================================================================
-- Run this script in your Supabase SQL Editor to support the Affiliate Payouts flow.

CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE CASCADE,
    affiliate_email TEXT NOT NULL,
    affiliate_name TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    usd_sales NUMERIC NOT NULL DEFAULT 0,
    crc_sales NUMERIC NOT NULL DEFAULT 0,
    commission_rate NUMERIC NOT NULL DEFAULT 0,
    usd_commission NUMERIC NOT NULL DEFAULT 0,
    crc_commission NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    orders_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    email_html TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    approved_by TEXT
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status ON public.affiliate_payouts(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_id ON public.affiliate_payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_dates ON public.affiliate_payouts(start_date, end_date);

-- Enable RLS
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if re-running
DROP POLICY IF EXISTS "Allow superadmins full access to affiliate_payouts" ON public.affiliate_payouts;

-- Allow superadmins full read and write access
CREATE POLICY "Allow superadmins full access to affiliate_payouts" 
ON public.affiliate_payouts 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles 
    WHERE public.admin_profiles.user_id = auth.uid() 
    AND public.admin_profiles.is_superadmin = true
  )
);
