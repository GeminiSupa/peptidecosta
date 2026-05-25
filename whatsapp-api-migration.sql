-- =========================================================================
-- WHATSAPP BUSINESS API — DATABASE MIGRATION
-- =========================================================================
-- Run this in your Supabase SQL Editor to prepare the database for
-- the WhatsApp Cloud API webhook integration.

-- 1. Add real WhatsApp number column to existing orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS whatsapp_wa_id TEXT;

-- 2. Create WhatsApp messages log table
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id TEXT NOT NULL,               -- Real WhatsApp phone number (e.g. "50612345678")
    display_name TEXT,                 -- WhatsApp profile name
    message_text TEXT,
    message_type TEXT DEFAULT 'text',  -- text, image, document, etc.a
    direction TEXT DEFAULT 'inbound',  -- inbound = customer→business, outbound = business→customer
    matched_order_id UUID,             -- Link to the order if we can match it
    raw_payload JSONB,                 -- Full webhook payload for debugging
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS on whatsapp_messages
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Allow service role insert to whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow authenticated read access to whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow authenticated delete access to whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Allow anon insert to whatsapp_messages" ON public.whatsapp_messages;

-- The webhook uses the service role key, but we also allow anon insert
-- so the webhook can work with either key configuration
CREATE POLICY "Allow anon insert to whatsapp_messages"
ON public.whatsapp_messages FOR INSERT
WITH CHECK (true);

-- Only authenticated admin users can view messages
CREATE POLICY "Allow authenticated read access to whatsapp_messages"
ON public.whatsapp_messages FOR SELECT
TO authenticated
USING (true);

-- Only authenticated admin users can delete messages
CREATE POLICY "Allow authenticated delete access to whatsapp_messages"
ON public.whatsapp_messages FOR DELETE
TO authenticated
USING (true);

-- 4. Index for fast lookups by wa_id and order matching
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id ON public.whatsapp_messages (wa_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_matched_order ON public.whatsapp_messages (matched_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_whatsapp_wa_id ON public.orders (whatsapp_wa_id);
