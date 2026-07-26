-- WhatsApp message log used by Sales WhatsApp and WhatsApp Device.
-- Safe to run even if the table already exists.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id TEXT NOT NULL,
  display_name TEXT,
  message_text TEXT,
  message_type TEXT DEFAULT 'text',
  direction TEXT NOT NULL,
  media_url TEXT,
  matched_order_id UUID,
  raw_payload JSONB,
  meta_message_id TEXT,
  delivery_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'cloud_api';

UPDATE public.whatsapp_messages
SET source = 'cloud_api'
WHERE source IS NULL OR source = '';

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id_created_at
ON public.whatsapp_messages (wa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_source
ON public.whatsapp_messages (source);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_source_created_at
ON public.whatsapp_messages (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_meta_message_id
ON public.whatsapp_messages (meta_message_id);
