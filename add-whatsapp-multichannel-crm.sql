-- Multi-number WhatsApp channels linked to one canonical CRM customer.
-- Run after add-whatsapp-conversations-routing.sql and add-lead-claiming.sql.
-- Safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id TEXT NOT NULL UNIQUE,
  waba_id TEXT,
  display_phone_number TEXT,
  name TEXT,
  source TEXT NOT NULL DEFAULT 'cloud_api',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep a fallback channel for messages written before Meta's receiving phone
-- number was stored. New webhook traffic automatically creates real channels.
INSERT INTO public.whatsapp_channels (
  phone_number_id,
  name,
  source,
  status,
  metadata
)
VALUES (
  'legacy-default',
  'Legacy WhatsApp',
  'cloud_api',
  'active',
  '{"legacy":true}'::jsonb
)
ON CONFLICT (phone_number_id) DO NOTHING;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS channel_id UUID
    REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS channel_id UUID
    REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_inbound_channel_id UUID
    REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_outbound_channel_id UUID
    REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_lead_id UUID
    REFERENCES public.catalog_leads(id) ON DELETE SET NULL;

UPDATE public.whatsapp_messages message
SET channel_id = channel.id
FROM public.whatsapp_channels channel
WHERE message.channel_id IS NULL
  AND channel.phone_number_id = 'legacy-default';

UPDATE public.whatsapp_conversations conversation
SET
  channel_id = channel.id,
  last_inbound_channel_id = CASE
    WHEN conversation.last_inbound_at IS NOT NULL THEN channel.id
    ELSE conversation.last_inbound_channel_id
  END,
  last_outbound_channel_id = CASE
    WHEN conversation.last_outbound_at IS NOT NULL THEN channel.id
    ELSE conversation.last_outbound_channel_id
  END
FROM public.whatsapp_channels channel
WHERE conversation.channel_id IS NULL
  AND channel.phone_number_id = 'legacy-default';

-- Link existing WhatsApp conversations to the canonical CRM lead selected by
-- add-lead-claiming.sql. The final eight digits are the existing CRM identity
-- convention for Costa Rica and international formatting variants.
UPDATE public.whatsapp_conversations conversation
SET contact_lead_id = identity.lead_id
FROM public.lead_contact_identities identity
WHERE conversation.contact_lead_id IS NULL
  AND identity.identity_type = 'phone'
  AND identity.identity_value = RIGHT(
    REGEXP_REPLACE(conversation.wa_id, '\D', '', 'g'),
    8
  );

CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_status
  ON public.whatsapp_channels(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_channel_created
  ON public.whatsapp_messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_contact_lead
  ON public.whatsapp_conversations(contact_lead_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last_inbound_channel
  ON public.whatsapp_conversations(last_inbound_channel_id);

-- Meta retries webhooks. The application checks this indexed ID before insert,
-- while local device/session messages are allowed to omit it.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_meta_message_lookup
  ON public.whatsapp_messages(meta_message_id)
  WHERE meta_message_id IS NOT NULL;

ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow WhatsApp team to read channels"
  ON public.whatsapp_channels;

CREATE POLICY "Allow WhatsApp team to read channels"
  ON public.whatsapp_channels
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles profile
      WHERE profile.user_id = auth.uid()
        AND COALESCE(profile.status, 'active') = 'active'
        AND COALESCE(profile.tier, 'staff') <> 'sub_user'
        AND (
          profile.is_superadmin IS TRUE
          OR profile.permissions ? 'whatsapp_ai'
          OR profile.permissions ? 'wa_session'
        )
    )
  );

-- CRM ownership is the source of truth. This links a lead to its shared
-- WhatsApp conversation and mirrors explicit ownership changes into the inbox.
CREATE OR REPLACE FUNCTION public.sync_crm_owner_to_whatsapp_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_phone TEXT;
  owner_profile public.admin_profiles%ROWTYPE;
  owner_was_cleared BOOLEAN;
BEGIN
  normalized_phone := RIGHT(REGEXP_REPLACE(COALESCE(
    NEW.phone,
    CASE WHEN NEW.contact_value NOT LIKE '%@%' THEN NEW.contact_value END,
    ''
  ), '\D', '', 'g'), 8);

  IF LENGTH(normalized_phone) <> 8 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    owner_was_cleared :=
      NULLIF(TRIM(COALESCE(OLD.sales_agent, '')), '') IS NOT NULL
      AND NULLIF(TRIM(COALESCE(NEW.sales_agent, '')), '') IS NULL;
  ELSE
    owner_was_cleared := false;
  END IF;

  IF NULLIF(TRIM(COALESCE(NEW.sales_agent, '')), '') IS NOT NULL THEN
    SELECT profile.*
    INTO owner_profile
    FROM public.admin_profiles profile
    WHERE COALESCE(profile.status, 'active') = 'active'
      AND COALESCE(profile.tier, 'staff') <> 'sub_user'
      AND LOWER(TRIM(NEW.sales_agent)) IN (
        LOWER(TRIM(COALESCE(profile.name, ''))),
        LOWER(TRIM(COALESCE(profile.email, ''))),
        LOWER(SPLIT_PART(COALESCE(profile.email, ''), '@', 1))
      )
    ORDER BY profile.is_superadmin ASC, profile.created_at ASC
    LIMIT 1;
  END IF;

  UPDATE public.whatsapp_conversations conversation
  SET
    contact_lead_id = NEW.id,
    assigned_to = CASE
      WHEN owner_profile.user_id IS NOT NULL THEN owner_profile.user_id
      WHEN owner_was_cleared THEN NULL
      ELSE conversation.assigned_to
    END,
    assigned_to_email = CASE
      WHEN owner_profile.user_id IS NOT NULL THEN owner_profile.email
      WHEN owner_was_cleared THEN NULL
      ELSE conversation.assigned_to_email
    END,
    assigned_to_name = CASE
      WHEN owner_profile.user_id IS NOT NULL THEN COALESCE(owner_profile.name, owner_profile.email)
      WHEN owner_was_cleared THEN NULL
      ELSE conversation.assigned_to_name
    END,
    assigned_at = CASE
      WHEN owner_profile.user_id IS NOT NULL THEN now()
      WHEN owner_was_cleared THEN NULL
      ELSE conversation.assigned_at
    END,
    updated_at = now()
  WHERE RIGHT(REGEXP_REPLACE(conversation.wa_id, '\D', '', 'g'), 8)
    = normalized_phone;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_crm_owner_to_whatsapp_conversation
  ON public.catalog_leads;

CREATE TRIGGER trg_sync_crm_owner_to_whatsapp_conversation
  AFTER INSERT OR UPDATE OF sales_agent, phone, contact_value
  ON public.catalog_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_crm_owner_to_whatsapp_conversation();

-- Apply current CRM owners to already-linked conversations immediately.
UPDATE public.whatsapp_conversations conversation
SET
  assigned_to = profile.user_id,
  assigned_to_email = profile.email,
  assigned_to_name = COALESCE(profile.name, profile.email),
  assigned_at = COALESCE(conversation.assigned_at, now()),
  updated_at = now()
FROM public.catalog_leads lead
JOIN public.admin_profiles profile
  ON LOWER(TRIM(lead.sales_agent)) IN (
    LOWER(TRIM(COALESCE(profile.name, ''))),
    LOWER(TRIM(COALESCE(profile.email, ''))),
    LOWER(SPLIT_PART(COALESCE(profile.email, ''), '@', 1))
  )
WHERE conversation.contact_lead_id = lead.id
  AND NULLIF(TRIM(COALESCE(lead.sales_agent, '')), '') IS NOT NULL
  AND COALESCE(profile.status, 'active') = 'active'
  AND COALESCE(profile.tier, 'staff') <> 'sub_user';

NOTIFY pgrst, 'reload schema';
