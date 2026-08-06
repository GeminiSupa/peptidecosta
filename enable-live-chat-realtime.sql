-- Make the live chat update without a refresh.
--
-- Both ends already subscribe to postgres_changes (src/components/ChatWidget.js
-- and src/components/admin/LiveChatInbox.js), but two things blocked delivery:
-- the tables were never added to the supabase_realtime publication, and
-- live-chat-migration.sql enabled RLS on them without creating any policy.
-- The subscriptions connected successfully and then never received an event,
-- so both sides only updated when something re-fetched.

-- 1. Publish the tables. Guarded because ALTER PUBLICATION ... ADD TABLE
--    errors out if the table is already a member.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_chat_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_messages;
  END IF;
END $$;

-- 2. Realtime re-checks RLS against each changed row before it delivers the
--    event, so update and delete events need the whole old row in the WAL
--    rather than just the primary key.
ALTER TABLE public.live_chat_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.live_chat_messages REPLICA IDENTITY FULL;

-- 3. Read access for signed-in staff only.
--
--    There is deliberately NO policy for `anon`. Website visitors are
--    anonymous with no auth context, and visitor_id is just a string kept in
--    localStorage, so RLS cannot tell one visitor from another. Any anon
--    SELECT policy on these tables would therefore let any visitor subscribe
--    to every other customer's conversation. The widget keeps reading through
--    /api/live-chat instead, which runs on the service role and filters by
--    visitor id server-side.
--
--    Admin sign-in is the only way to reach the `authenticated` role in this
--    project (there is no customer signup), so `authenticated` means staff.
DROP POLICY IF EXISTS "Staff read live chat conversations" ON public.live_chat_conversations;
CREATE POLICY "Staff read live chat conversations"
  ON public.live_chat_conversations
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff read live chat messages" ON public.live_chat_messages;
CREATE POLICY "Staff read live chat messages"
  ON public.live_chat_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- Verify: this should return both table names once the migration has run.
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename LIKE 'live_chat%';
