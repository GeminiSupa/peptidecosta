-- =========================================================================
-- PRODUCT & INVENTORY ENHANCEMENTS: SUPPLIER, COST, BATCH & FORECASTING
-- =========================================================================

-- 1. ADD SUPPLIER, COST, LEAD TIME & BATCH FIELDS TO PRODUCTS TABLE
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_usd NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_crc NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_lead_time_days INTEGER DEFAULT 14;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS batch_number TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS batch_expiry_date TIMESTAMPTZ;

-- 2. CREATE PRODUCT BATCHES LOG TABLE
CREATE TABLE IF NOT EXISTS public.product_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    batch_number TEXT NOT NULL,
    supplier_name TEXT,
    vial_count INTEGER DEFAULT 0,
    unit_cost_usd NUMERIC DEFAULT 0,
    manufactured_date TIMESTAMPTZ,
    expiry_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for product_batches
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to product_batches" ON public.product_batches;
DROP POLICY IF EXISTS "Allow authenticated write access to product_batches" ON public.product_batches;

CREATE POLICY "Allow authenticated read access to product_batches"
ON public.product_batches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write access to product_batches"
ON public.product_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index for product batch lookups
CREATE INDEX IF NOT EXISTS idx_product_batches_product_id ON public.product_batches (product_id);
