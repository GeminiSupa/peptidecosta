-- Chatwoot -> CRM operational sync and analytics.
-- Run this once in the Supabase SQL editor before enabling the webhook.

ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_status TEXT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_error TEXT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_conversation_url TEXT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_synced_at TIMESTAMPTZ;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_conversation_id BIGINT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_contact_id BIGINT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_conversation_status TEXT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_assignee_name TEXT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_assignee_email TEXT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_first_response_at TIMESTAMPTZ;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_first_response_seconds INTEGER;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_last_message_at TIMESTAMPTZ;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_last_message_direction TEXT;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_message_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_resolved_at TIMESTAMPTZ;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_last_event_at TIMESTAMPTZ;
ALTER TABLE public.catalog_leads ADD COLUMN IF NOT EXISTS chatwoot_last_event_type TEXT;

ALTER TABLE public.catalog_leads DROP CONSTRAINT IF EXISTS catalog_leads_chatwoot_direction_check;
ALTER TABLE public.catalog_leads ADD CONSTRAINT catalog_leads_chatwoot_direction_check
  CHECK (chatwoot_last_message_direction IS NULL OR chatwoot_last_message_direction IN ('inbound', 'outbound'));

CREATE UNIQUE INDEX IF NOT EXISTS catalog_leads_chatwoot_conversation_idx
  ON public.catalog_leads (chatwoot_conversation_id)
  WHERE chatwoot_conversation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chatwoot_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  lead_id UUID REFERENCES public.catalog_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  conversation_id BIGINT NOT NULL,
  message_id BIGINT,
  direction TEXT CHECK (direction IS NULL OR direction IN ('inbound', 'outbound')),
  conversation_status TEXT,
  actor_name TEXT,
  actor_email TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatwoot_events_lead_time_idx
  ON public.chatwoot_events (lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS chatwoot_events_conversation_time_idx
  ON public.chatwoot_events (conversation_id, occurred_at DESC);

ALTER TABLE public.chatwoot_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chatwoot_events FROM anon, authenticated;

ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS recipient_email TEXT;
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS event_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_event_key_idx
  ON public.admin_notifications (event_key)
  WHERE event_key IS NOT NULL;

NOTIFY pgrst, 'reload schema';
