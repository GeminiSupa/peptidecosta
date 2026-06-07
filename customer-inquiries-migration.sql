-- =========================================================================
--  CUSTOMER INQUIRIES TABLE — Contact Form Communication System
-- =========================================================================
-- Run this in your Supabase SQL Editor to create the customer_inquiries table.

CREATE TABLE IF NOT EXISTS public.customer_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'New',        -- New | Read | Replied | Closed
    admin_reply TEXT,                          -- The reply text sent by admin
    replied_at TIMESTAMPTZ,
    replied_by TEXT,                           -- Admin email who replied
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.customer_inquiries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe re-runs)
DROP POLICY IF EXISTS "Allow public insert access to inquiries" ON public.customer_inquiries;
DROP POLICY IF EXISTS "Allow authenticated read access to inquiries" ON public.customer_inquiries;
DROP POLICY IF EXISTS "Allow authenticated update access to inquiries" ON public.customer_inquiries;
DROP POLICY IF EXISTS "Allow authenticated delete access to inquiries" ON public.customer_inquiries;

-- Public can submit inquiries via the contact form
CREATE POLICY "Allow public insert access to inquiries"
ON public.customer_inquiries FOR INSERT
WITH CHECK (true);

-- Only authenticated admins can view inquiries
CREATE POLICY "Allow authenticated read access to inquiries"
ON public.customer_inquiries FOR SELECT
TO authenticated
USING (true);

-- Only authenticated admins can update inquiries (reply, change status)
CREATE POLICY "Allow authenticated update access to inquiries"
ON public.customer_inquiries FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Only authenticated admins can delete inquiries (spam removal)
CREATE POLICY "Allow authenticated delete access to inquiries"
ON public.customer_inquiries FOR DELETE
TO authenticated
USING (true);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_status ON public.customer_inquiries (status);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_created_at ON public.customer_inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_email ON public.customer_inquiries (customer_email);
