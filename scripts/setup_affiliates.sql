-- 1. Create Affiliates Table
CREATE TABLE IF NOT EXISTS public.affiliates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  whatsapp TEXT,
  commission_rate NUMERIC DEFAULT 0.10, -- 10% default commission
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Promo Codes Table
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE CASCADE,
  discount_pct NUMERIC DEFAULT 0.10, -- 10% default discount for the customer
  usage_limit INTEGER DEFAULT NULL,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Modify Orders Table to track commissions and discounts
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS promo_code TEXT,
ADD COLUMN IF NOT EXISTS discount_amount_crc NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount_usd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES public.affiliates(id),
ADD COLUMN IF NOT EXISTS affiliate_commission_usd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS affiliate_commission_crc NUMERIC DEFAULT 0;

-- 4. Set up Row Level Security (RLS) policies
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Enable all access for service role on affiliates" ON public.affiliates FOR ALL USING (true);
CREATE POLICY "Enable all access for service role on promo_codes" ON public.promo_codes FOR ALL USING (true);

-- Allow public read access to promo codes so the checkout API can validate them
CREATE POLICY "Enable read access for public on promo_codes" ON public.promo_codes FOR SELECT USING (true);
