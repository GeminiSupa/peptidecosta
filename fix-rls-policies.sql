-- Fix Row Level Security (RLS) policies to allow the Next.js frontend to save data

-- 1. Orders
-- Order access is intentionally not repaired here anymore. Guest checkout now
-- writes through the service-role API, and customer-accounts-foundation.sql
-- owns the complete order policy set. Re-adding public SELECT/UPDATE here would
-- expose every customer's order ledger.

-- 2. Abandoned Carts
-- Cart access is intentionally not repaired here anymore. The storefront now
-- writes through /api/cart/track on the service role, and
-- lock-abandoned-carts-rls.sql owns the complete policy set. The public
-- SELECT/UPDATE/DELETE policies that used to live here exposed every shopper's
-- name, phone, email, IP, geolocation and cart contents to anyone holding the
-- anon key — which ships in the JS bundle — and let them delete the table.

-- 3. Product Reviews
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert to product_reviews" ON public.product_reviews;
CREATE POLICY "Allow public insert to product_reviews" ON public.product_reviews FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public select to product_reviews" ON public.product_reviews;
CREATE POLICY "Allow public select to product_reviews" ON public.product_reviews FOR SELECT TO public USING (true);
