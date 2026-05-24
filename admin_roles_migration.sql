-- =========================================================================
--                     PEPTIDES COSTA RICA - RBAC MIGRATION
-- =========================================================================
-- Run this script in your Supabase SQL Editor to create the admin roles system.

CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    permissions JSONB DEFAULT '[]'::jsonb, -- Array of strings e.g. ['orders', 'customers', 'leads']
    is_superadmin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id),
    UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Allow authenticated read access to admin_profiles" ON public.admin_profiles;
DROP POLICY IF EXISTS "Allow authenticated write access to admin_profiles" ON public.admin_profiles;
DROP POLICY IF EXISTS "Allow superadmin full access" ON public.admin_profiles;

-- Everyone logged in can read admin profiles (necessary for the app to know who is who)
CREATE POLICY "Allow authenticated read access to admin_profiles" 
ON public.admin_profiles FOR SELECT 
TO authenticated 
USING (true);

-- Only service role can modify this table by default.
-- You can add policies if you want frontend superadmins to directly edit the table, 
-- but since we are using secure backend API routes with the Service Role Key to manage users,
-- we do not need to expose write operations to the frontend authenticated users.

-- =========================================================================
-- SEED SUPERADMINS
-- =========================================================================
-- Automatically copy the main accounts from auth.users into admin_profiles
INSERT INTO public.admin_profiles (user_id, email, name, is_superadmin, permissions)
SELECT id, email, 'Super Admin', true, '[]'::jsonb
FROM auth.users
WHERE email IN ('joe@peptides.com', 'info@peptidescostarica.net')
ON CONFLICT (email) DO UPDATE 
SET is_superadmin = true;
