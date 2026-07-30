-- =========================================================================
--            PEPTIDES COSTA RICA - SUB-USER REASSIGNMENT
-- =========================================================================
-- Run this in your Supabase SQL Editor after add-sub-user-tier.sql.
-- Safe to re-run.
--
-- When a staff member leaves, her sub-users do not leave with her. The owner
-- moves them to another staff member: the sub-user keeps their 8%, their link
-- and their login, and the 2% override starts going to whoever took them on.
--
-- Only the owner can do this. A staff member cannot hand her people to someone
-- else, and cannot help herself to someone else's.
--
-- These columns are an audit trail, not a mechanism. The override is always
-- calculated from the CURRENT parent_agent_id, so a move takes effect on the
-- next weekly scan. parent_since is what lets you see, months later, why a
-- given week paid José instead of María.

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS parent_since               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_parent_agent_id   UUID,
  ADD COLUMN IF NOT EXISTS reassigned_by              TEXT,
  ADD COLUMN IF NOT EXISTS reassigned_at              TIMESTAMPTZ;

-- Existing sub-users have been with their staff member since they were created.
UPDATE public.admin_profiles
SET parent_since = created_at
WHERE tier = 'sub_user'
  AND parent_since IS NULL;

-- -------------------------------------------------------------------------
-- Verify
-- -------------------------------------------------------------------------
--   SELECT s.name AS sub_user, p.name AS staff_member, s.parent_since,
--          s.reassigned_by, s.reassigned_at
--   FROM public.admin_profiles s
--   LEFT JOIN public.admin_profiles p ON p.user_id = s.parent_agent_id
--   WHERE s.tier = 'sub_user'
--   ORDER BY s.reassigned_at DESC NULLS LAST;
--
-- The depth trigger from add-sub-user-tier.sql already refuses a move onto
-- another sub-user, so this should raise an exception:
--   UPDATE public.admin_profiles
--   SET parent_agent_id = (SELECT user_id FROM public.admin_profiles
--                          WHERE tier = 'sub_user' AND user_id IS NOT NULL LIMIT 1)
--   WHERE tier = 'sub_user' AND name = 'Some Sub User';
