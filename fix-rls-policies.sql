-- Fix Row Level Security (RLS) policies to allow the Next.js frontend to save data

-- 1. Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert to orders" ON public.orders;
CREATE POLICY "Allow public insert to orders" ON public.orders FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public select to orders" ON public.orders;
CREATE POLICY "Allow public select to orders" ON public.orders FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow public update to orders" ON public.orders;
CREATE POLICY "Allow public update to orders" ON public.orders FOR UPDATE TO public USING (true);

-- 2. Abandoned Carts
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert to abandoned_carts" ON public.abandoned_carts;
CREATE POLICY "Allow public insert to abandoned_carts" ON public.abandoned_carts FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public select to abandoned_carts" ON public.abandoned_carts;
CREATE POLICY "Allow public select to abandoned_carts" ON public.abandoned_carts FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow public update to abandoned_carts" ON public.abandoned_carts;
CREATE POLICY "Allow public update to abandoned_carts" ON public.abandoned_carts FOR UPDATE TO public USING (true);

-- 3. Product Reviews
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert to product_reviews" ON public.product_reviews;
CREATE POLICY "Allow public insert to product_reviews" ON public.product_reviews FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public select to product_reviews" ON public.product_reviews;
CREATE POLICY "Allow public select to product_reviews" ON public.product_reviews FOR SELECT TO public USING (true);
