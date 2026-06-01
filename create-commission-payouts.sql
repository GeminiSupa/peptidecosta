-- =========================================================================
--               PEPTIDES COSTA RICA - COMMISSION PAYOUTS SCHEMAS
-- =========================================================================
-- Run this script in your Supabase SQL Editor to support the Admin Approval flow.

CREATE TABLE IF NOT EXISTS public.commission_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.admin_profiles(user_id) ON DELETE CASCADE,
    agent_email TEXT NOT NULL,
    agent_name TEXT,
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
CREATE INDEX IF NOT EXISTS idx_commission_payouts_status ON public.commission_payouts(status);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_agent_email ON public.commission_payouts(agent_email);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_dates ON public.commission_payouts(start_date, end_date);

-- Enable RLS
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if re-running
DROP POLICY IF EXISTS "Allow superadmins full access to commission_payouts" ON public.commission_payouts;

-- Allow superadmins full read and write access
CREATE POLICY "Allow superadmins full access to commission_payouts" 
ON public.commission_payouts 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_profiles 
    WHERE public.admin_profiles.user_id = auth.uid() 
    AND public.admin_profiles.is_superadmin = true
  )
);
