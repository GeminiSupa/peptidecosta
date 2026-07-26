-- Team member profile photos.
-- Run this in Supabase SQL Editor before using profile picture uploads.

CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  is_superadmin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(email)
);

ALTER TABLE public.admin_profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to admin_profiles" ON public.admin_profiles;

CREATE POLICY "Allow authenticated read access to admin_profiles"
ON public.admin_profiles FOR SELECT
TO authenticated
USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('team-avatars', 'team-avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Read Team Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Team Avatar Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Team Avatar Updates" ON storage.objects;

CREATE POLICY "Public Read Team Avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'team-avatars');

CREATE POLICY "Authenticated Team Avatar Uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'team-avatars');

CREATE POLICY "Authenticated Team Avatar Updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'team-avatars')
WITH CHECK (bucket_id = 'team-avatars');
