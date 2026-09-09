-- =========================================================================
--   RESTRICT THE FACEBOOK INBOX AND TEAM CHAT TO PEOPLE WHO ARE GRANTED THEM
-- =========================================================================
-- Run this in the Supabase SQL Editor BEFORE deploying the matching code.
-- Safe to re-run.
--
-- Both tabs used to be always-available: every active staff profile reached
-- them whatever their permissions column said, because resolveAdminTabAccess
-- short-circuited on the alwaysAvailable flag before it ever read permissions.
-- That is fine while every login belongs to someone who works here. It stops
-- being fine the moment an outside affiliate is given a login so they can watch
-- their own commission, which is what prompted this.
--
-- The code change alone would take both tabs away from the existing team, so
-- section 1 grants the two keys to everyone who has them in practice today.
-- Running this first means nobody notices the deploy.

-- -------------------------------------------------------------------------
-- 1. Nobody loses anything they can reach today
-- -------------------------------------------------------------------------
-- Superadmins are skipped because resolveAdminTabAccess returns true for them
-- before it reads permissions. Sub-users are skipped because their allow-list
-- is checked earlier still, so a granted key would be inert — and writing one
-- in would be a lie about what they can reach.
UPDATE public.admin_profiles
SET permissions = (
  SELECT jsonb_agg(DISTINCT value)
  FROM jsonb_array_elements_text(
    COALESCE(permissions, '[]'::jsonb) || '["messenger","team_chat"]'::jsonb
  ) AS value
)
WHERE COALESCE(is_superadmin, false) = false
  AND COALESCE(tier, 'staff') = 'staff'
  AND NOT (
    COALESCE(permissions, '[]'::jsonb) ? 'messenger'
    AND COALESCE(permissions, '[]'::jsonb) ? 'team_chat'
  );

-- -------------------------------------------------------------------------
-- 1b. Take the two keys back off anyone who should never have had them
-- -------------------------------------------------------------------------
-- Section 1 grants both keys to every staff profile, because its job is to
-- leave the existing team exactly as it was. Anyone added since this file was
-- written gets caught by that too, which is wrong for an outside partner given
-- a login purely to watch their own commission.
--
-- List those people here by email before running. Editing this list is the
-- whole point of the block, so it is expected to differ between runs.
UPDATE public.admin_profiles
SET permissions = COALESCE((
  SELECT jsonb_agg(value)
  FROM jsonb_array_elements_text(COALESCE(permissions, '[]'::jsonb)) AS value
  WHERE value NOT IN ('messenger', 'team_chat')
), '[]'::jsonb)
WHERE lower(trim(email)) IN (
  'coto.tatiana12@yahoo.com'
);

-- -------------------------------------------------------------------------
-- 2. Team chat is closed at the database, not just in the navigation
-- -------------------------------------------------------------------------
-- TeamChat.js reads team_messages straight from the browser Supabase client,
-- so hiding the tab hides nothing on its own: the rows stayed readable to
-- anyone who could form the query.
--
-- The old policy was `TO authenticated USING (true)`. Storefront customers are
-- Supabase Auth users on this same project, so "authenticated" included every
-- customer who ever made an account, not merely the staff this was written for.
-- The policies below ask who the caller actually is.
CREATE OR REPLACE FUNCTION public.can_use_team_chat()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles p
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.status, 'active') = 'active'
      AND COALESCE(p.tier, 'staff') = 'staff'
      AND (
        COALESCE(p.is_superadmin, false) = true
        OR COALESCE(p.permissions, '[]'::jsonb) ? 'team_chat'
      )
  );
$$;

DROP POLICY IF EXISTS "Allow authenticated insert to team_messages" ON public.team_messages;
DROP POLICY IF EXISTS "Allow authenticated read to team_messages"   ON public.team_messages;
DROP POLICY IF EXISTS "Allow authenticated delete to team_messages" ON public.team_messages;
DROP POLICY IF EXISTS "team_messages_chat_members_read"   ON public.team_messages;
DROP POLICY IF EXISTS "team_messages_chat_members_insert" ON public.team_messages;
DROP POLICY IF EXISTS "team_messages_chat_members_update" ON public.team_messages;
DROP POLICY IF EXISTS "team_messages_chat_members_delete" ON public.team_messages;

CREATE POLICY "team_messages_chat_members_read"
  ON public.team_messages FOR SELECT TO authenticated
  USING (public.can_use_team_chat());

CREATE POLICY "team_messages_chat_members_insert"
  ON public.team_messages FOR INSERT TO authenticated
  WITH CHECK (public.can_use_team_chat());

-- Reactions, edits and read receipts are all UPDATEs from the browser. There
-- was no UPDATE policy at all before, so with RLS on they were already being
-- refused; this is the first time that path is actually allowed.
CREATE POLICY "team_messages_chat_members_update"
  ON public.team_messages FOR UPDATE TO authenticated
  USING (public.can_use_team_chat())
  WITH CHECK (public.can_use_team_chat());

CREATE POLICY "team_messages_chat_members_delete"
  ON public.team_messages FOR DELETE TO authenticated
  USING (public.can_use_team_chat());

-- Presence carries who is online and their email, so it gets the same gate.
DROP POLICY IF EXISTS "team_presence_authenticated_all" ON public.team_presence;
DROP POLICY IF EXISTS "team_presence_chat_members_all"  ON public.team_presence;

CREATE POLICY "team_presence_chat_members_all"
  ON public.team_presence FOR ALL TO authenticated
  USING (public.can_use_team_chat())
  WITH CHECK (public.can_use_team_chat());

-- -------------------------------------------------------------------------
-- 3. Verify
-- -------------------------------------------------------------------------
-- Everyone who is meant to keep both tabs should list both keys:
--   SELECT name, tier, is_superadmin,
--          permissions ? 'messenger' AS has_messenger,
--          permissions ? 'team_chat' AS has_team_chat
--   FROM public.admin_profiles ORDER BY name;
--
-- Signed in as a staff member without the key, this must return no rows:
--   SELECT count(*) FROM public.team_messages;
