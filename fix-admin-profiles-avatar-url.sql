-- Unblocks editing team members (granting Live Chat access, changing roles, pay).
--
-- The edit-member form posts the whole profile row, including avatar_url, so on
-- a database without that column every save fails with:
--   Could not find the 'avatar_url' column of 'admin_profiles' in the schema cache
--
-- Paste the statement below into the Supabase SQL Editor and run it.
-- Safe to re-run: IF NOT EXISTS makes it a no-op once the column is there.

ALTER TABLE public.admin_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Verify. Expect exactly one row: avatar_url | text | YES
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'admin_profiles'
  AND column_name = 'avatar_url';

-- That is all that is needed to fix the error. To also enable profile photo
-- uploads (the team-avatars storage bucket and its policies), run the full
-- team-profile-avatars-migration.sql afterwards.
