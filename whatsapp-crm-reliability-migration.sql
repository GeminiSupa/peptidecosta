-- Shared WhatsApp CRM reliability state.
--
-- Safe to run more than once. Run after add-whatsapp-conversations-routing.sql
-- and add-whatsapp-multichannel-crm.sql.

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_human_outbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_human_reply BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS labels TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_note TEXT;

ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_priority_check;

ALTER TABLE public.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_priority_check
  CHECK (priority IN ('normal', 'high', 'urgent'));

-- Best-effort historical baseline. AI and system replies are deliberately not
-- counted as human work. Future human sends write this field explicitly.
UPDATE public.whatsapp_conversations conversation
SET last_human_outbound_at = history.last_human_outbound_at
FROM (
  SELECT
    regexp_replace(wa_id, '\D', '', 'g') AS wa_id,
    max(created_at) FILTER (
      WHERE direction = 'outbound'
        AND lower(COALESCE(display_name, '')) NOT IN ('ai copilot', 'system')
    ) AS last_human_outbound_at
  FROM public.whatsapp_messages
  GROUP BY regexp_replace(wa_id, '\D', '', 'g')
) history
WHERE conversation.wa_id = history.wa_id
  AND conversation.last_human_outbound_at IS NULL;

UPDATE public.whatsapp_conversations
SET needs_human_reply = (
  status <> 'resolved'
  AND last_inbound_at IS NOT NULL
  AND last_inbound_at > COALESCE(last_human_outbound_at, '-infinity'::timestamptz)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_human_queue
  ON public.whatsapp_conversations(needs_human_reply, priority, last_inbound_at DESC)
  WHERE status <> 'resolved';

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_follow_up
  ON public.whatsapp_conversations(follow_up_at)
  WHERE follow_up_at IS NOT NULL AND status <> 'resolved';

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_labels
  ON public.whatsapp_conversations USING GIN(labels);

-- Repair historical direct-to-WhatsApp contacts that predate automatic lead
-- creation. A conversation does not need a catalog visit to become a CRM lead.
INSERT INTO public.catalog_leads (
  contact_method,
  contact_value,
  phone,
  name,
  language,
  status,
  notes,
  lead_source,
  utm_source,
  utm_medium,
  whatsapp_consent,
  marketing_consent,
  created_at,
  updated_at
)
SELECT
  'whatsapp',
  conversation.wa_id,
  conversation.wa_id,
  NULLIF(conversation.display_name, ''),
  'es',
  'New',
  'Automatically backfilled from an inbound WhatsApp conversation.',
  'whatsapp_inbound',
  'whatsapp',
  'messaging',
  false,
  false,
  COALESCE(conversation.last_inbound_at, conversation.created_at, now()),
  now()
FROM public.whatsapp_conversations conversation
WHERE conversation.contact_lead_id IS NULL
  AND conversation.last_inbound_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.lead_contact_identities identity
    WHERE identity.identity_type = 'phone'
      AND identity.identity_value = right(regexp_replace(conversation.wa_id, '\D', '', 'g'), 8)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.catalog_leads lead
    WHERE right(regexp_replace(COALESCE(lead.phone, lead.contact_value, ''), '\D', '', 'g'), 8)
      = right(regexp_replace(conversation.wa_id, '\D', '', 'g'), 8)
  );

UPDATE public.whatsapp_conversations conversation
SET contact_lead_id = identity.lead_id,
    updated_at = now()
FROM public.lead_contact_identities identity
WHERE conversation.contact_lead_id IS NULL
  AND identity.identity_type = 'phone'
  AND identity.identity_value = right(regexp_replace(conversation.wa_id, '\D', '', 'g'), 8);

-- Read state belongs to an agent, not to the whole team. Opening a conversation
-- therefore cannot clear another agent's badge or the shared human-work queue.
CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_reads (
  conversation_id UUID NOT NULL
    REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES public.admin_profiles(user_id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ,
  manually_unread BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_reads_user
  ON public.whatsapp_conversation_reads(user_id, updated_at DESC);

ALTER TABLE public.whatsapp_conversation_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents read own WhatsApp read state" ON public.whatsapp_conversation_reads;
CREATE POLICY "Agents read own WhatsApp read state"
ON public.whatsapp_conversation_reads
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Writes go through the authenticated admin API using the service role.

-- Realtime removes the double-response window left by the 30-second poll. The
-- guarded blocks make this safe on projects where either table is published.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
