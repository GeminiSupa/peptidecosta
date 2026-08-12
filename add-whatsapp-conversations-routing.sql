-- Central WhatsApp conversations and agent routing.
--
-- Run in Supabase SQL Editor after deploying this code. Safe to run more than
-- once. It replaces browser-local WhatsApp ownership with one shared row per
-- customer phone number.

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id              TEXT NOT NULL UNIQUE,
  display_name       TEXT,
  status             TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'pending', 'resolved', 'snoozed')),
  assigned_to        UUID REFERENCES public.admin_profiles(user_id) ON DELETE SET NULL,
  assigned_to_email  TEXT,
  assigned_to_name   TEXT,
  assigned_at        TIMESTAMPTZ,
  source             TEXT NOT NULL DEFAULT 'cloud_api',
  last_message_at    TIMESTAMPTZ,
  last_inbound_at    TIMESTAMPTZ,
  last_outbound_at   TIMESTAMPTZ,
  matched_order_id   UUID,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_matched_order_id_fkey;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'cloud_api';

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned_to
  ON public.whatsapp_conversations (assigned_to);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_status_last_message
  ON public.whatsapp_conversations (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last_inbound
  ON public.whatsapp_conversations (last_inbound_at DESC)
  WHERE last_inbound_at IS NOT NULL;

-- Backfill one conversation row per phone from the existing message log.
WITH ranked AS (
  SELECT
    regexp_replace(wa_id, '\D', '', 'g') AS clean_wa_id,
    display_name,
    direction,
    matched_order_id AS raw_matched_order_id,
    source,
    created_at,
    row_number() OVER (
      PARTITION BY regexp_replace(wa_id, '\D', '', 'g')
      ORDER BY created_at DESC
    ) AS row_rank,
    max(created_at) OVER (
      PARTITION BY regexp_replace(wa_id, '\D', '', 'g')
    ) AS last_message_at,
    max(created_at) FILTER (WHERE direction = 'inbound') OVER (
      PARTITION BY regexp_replace(wa_id, '\D', '', 'g')
    ) AS last_inbound_at,
    max(created_at) FILTER (WHERE direction = 'outbound') OVER (
      PARTITION BY regexp_replace(wa_id, '\D', '', 'g')
    ) AS last_outbound_at
  FROM public.whatsapp_messages
  WHERE wa_id IS NOT NULL
    AND length(regexp_replace(wa_id, '\D', '', 'g')) BETWEEN 8 AND 15
)
INSERT INTO public.whatsapp_conversations (
  wa_id,
  display_name,
  source,
  last_message_at,
  last_inbound_at,
  last_outbound_at,
  matched_order_id
)
SELECT
  clean_wa_id,
  NULLIF(display_name, ''),
  COALESCE(source, 'cloud_api'),
  last_message_at,
  last_inbound_at,
  last_outbound_at,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = ranked.raw_matched_order_id
    ) THEN ranked.raw_matched_order_id
    ELSE NULL
  END
FROM ranked
WHERE row_rank = 1
ON CONFLICT (wa_id) DO UPDATE SET
  display_name = COALESCE(EXCLUDED.display_name, whatsapp_conversations.display_name),
  source = COALESCE(EXCLUDED.source, whatsapp_conversations.source),
  last_message_at = GREATEST(
    COALESCE(whatsapp_conversations.last_message_at, '-infinity'::timestamptz),
    COALESCE(EXCLUDED.last_message_at, '-infinity'::timestamptz)
  ),
  last_inbound_at = NULLIF(GREATEST(
    COALESCE(whatsapp_conversations.last_inbound_at, '-infinity'::timestamptz),
    COALESCE(EXCLUDED.last_inbound_at, '-infinity'::timestamptz)
  ), '-infinity'::timestamptz),
  last_outbound_at = NULLIF(GREATEST(
    COALESCE(whatsapp_conversations.last_outbound_at, '-infinity'::timestamptz),
    COALESCE(EXCLUDED.last_outbound_at, '-infinity'::timestamptz)
  ), '-infinity'::timestamptz),
  matched_order_id = COALESCE(EXCLUDED.matched_order_id, whatsapp_conversations.matched_order_id),
  updated_at = now();

UPDATE public.whatsapp_conversations c
SET
  matched_order_id = NULL,
  updated_at = now()
WHERE c.matched_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = c.matched_order_id
  );

WITH candidates AS (
  SELECT
    c.wa_id,
    p.user_id,
    p.email,
    COALESCE(p.name, p.email) AS display_name,
    row_number() OVER (
      PARTITION BY c.wa_id
      ORDER BY o.created_at DESC NULLS LAST
    ) AS candidate_rank
  FROM public.whatsapp_conversations c
  JOIN public.orders o
    ON regexp_replace(COALESCE(o.whatsapp_wa_id, o.customer_phone, ''), '\D', '', 'g') LIKE '%' || right(c.wa_id, 8) || '%'
  JOIN public.admin_profiles p
    ON lower(trim(o.sales_agent)) IN (
      lower(trim(COALESCE(p.name, ''))),
      lower(trim(COALESCE(p.email, ''))),
      lower(split_part(COALESCE(p.email, ''), '@', 1))
    )
  WHERE c.assigned_to IS NULL
    AND o.sales_agent IS NOT NULL
    AND COALESCE(p.status, 'active') = 'active'
    AND COALESCE(p.tier, 'staff') <> 'sub_user'
    AND (
      p.is_superadmin IS TRUE
      OR p.permissions ? 'whatsapp_ai'
    )
)
UPDATE public.whatsapp_conversations c
SET
  assigned_to = candidates.user_id,
  assigned_to_email = candidates.email,
  assigned_to_name = candidates.display_name,
  assigned_at = now(),
  updated_at = now()
FROM candidates
WHERE candidates.candidate_rank = 1
  AND c.wa_id = candidates.wa_id
  AND c.assigned_to IS NULL;

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Allow authenticated update whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Allow assigned WhatsApp inbox reads" ON public.whatsapp_conversations;

CREATE POLICY "Allow assigned WhatsApp inbox reads"
ON public.whatsapp_conversations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_profiles p
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.status, 'active') = 'active'
      AND COALESCE(p.tier, 'staff') <> 'sub_user'
      AND (
        p.is_superadmin IS TRUE
        OR p.permissions ? 'whatsapp_ai'
      )
      AND (
        p.is_superadmin IS TRUE
        OR whatsapp_conversations.assigned_to IS NULL
        OR whatsapp_conversations.assigned_to = auth.uid()
      )
  )
);

-- Writes are handled by /api/admin/whatsapp-conversations with the service
-- role. No client-side UPDATE/INSERT policy is granted.

-- Lock the message log so a staff browser cannot directly read conversations
-- assigned to someone else.
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow authenticated delete access to whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow authenticated read whatsapp_messages by assignment" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow superadmin delete whatsapp_messages" ON public.whatsapp_messages;

CREATE POLICY "Allow authenticated read whatsapp_messages by assignment"
ON public.whatsapp_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_profiles p
    LEFT JOIN public.whatsapp_conversations c
      ON c.wa_id = regexp_replace(whatsapp_messages.wa_id, '\D', '', 'g')
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.status, 'active') = 'active'
      AND COALESCE(p.tier, 'staff') <> 'sub_user'
      AND (
        p.is_superadmin IS TRUE
        OR p.permissions ? 'whatsapp_ai'
      )
      AND (
        p.is_superadmin IS TRUE
        OR c.assigned_to IS NULL
        OR c.assigned_to = auth.uid()
      )
  )
);

CREATE POLICY "Allow superadmin delete whatsapp_messages"
ON public.whatsapp_messages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_superadmin IS TRUE
  )
);
