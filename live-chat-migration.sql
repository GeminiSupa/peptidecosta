-- Tidio-style website live chat.
-- Stores visitor conversations and agent replies for the custom dashboard inbox.

CREATE TABLE IF NOT EXISTS public.live_chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL UNIQUE,
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  page_url text,
  referrer text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  assigned_to uuid,
  assigned_to_email text,
  assigned_to_name text,
  last_message text,
  last_message_at timestamptz,
  last_customer_message_at timestamptz,
  last_agent_message_at timestamptz,
  unread_for_agent boolean NOT NULL DEFAULT false,
  unread_for_visitor boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.live_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.live_chat_conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('visitor', 'agent', 'system')),
  sender_name text,
  sender_email text,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_chat_conversations_status_idx
  ON public.live_chat_conversations (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS live_chat_conversations_assigned_to_idx
  ON public.live_chat_conversations (assigned_to, last_message_at DESC);

CREATE INDEX IF NOT EXISTS live_chat_messages_conversation_created_idx
  ON public.live_chat_messages (conversation_id, created_at ASC);

ALTER TABLE public.live_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

-- No public table policies: visitor and dashboard access goes through API
-- routes that validate the request and use the service role client.

-- Private storage bucket for customer-uploaded screenshots/PDFs in live chat.
-- Files are served through short-lived signed URLs from the API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'live-chat-attachments',
  'live-chat-attachments',
  false,
  8388608,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
