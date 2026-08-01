-- Closes the old product-write hole where every authenticated account could
-- insert, update, or delete catalog products from the browser Supabase client.
--
-- ORDER MATTERS: deploy the app version that writes products through
-- /api/admin/products first. That server route uses the service role and is
-- additionally guarded by the superadmin-only Products module.
--
-- Safe to re-run.

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated insert to products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated update to products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated delete to products" ON public.products;
DROP POLICY IF EXISTS "Superadmin can insert products" ON public.products;
DROP POLICY IF EXISTS "Superadmin can update products" ON public.products;
DROP POLICY IF EXISTS "Superadmin can delete products" ON public.products;

CREATE POLICY "Superadmin can insert products"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles
      WHERE admin_profiles.user_id = auth.uid()
        AND admin_profiles.is_superadmin = true
    )
  );

CREATE POLICY "Superadmin can update products"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles
      WHERE admin_profiles.user_id = auth.uid()
        AND admin_profiles.is_superadmin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles
      WHERE admin_profiles.user_id = auth.uid()
        AND admin_profiles.is_superadmin = true
    )
  );

CREATE POLICY "Superadmin can delete products"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles
      WHERE admin_profiles.user_id = auth.uid()
        AND admin_profiles.is_superadmin = true
    )
  );
