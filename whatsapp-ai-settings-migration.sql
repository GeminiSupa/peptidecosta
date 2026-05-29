-- =========================================================================
--             WHATSAPP AI COPILOT SETTINGS - DATABASE MIGRATION
-- =========================================================================
-- Run this in your Supabase SQL Editor to seed the default settings for
-- the intelligent WhatsApp Autopilot and personality prompt.

INSERT INTO public.site_settings (id, value)
VALUES (
    'whatsapp_settings',
    '{
        "ai_auto_reply": true,
        "ai_system_prompt": "You are ''Costa Peptides Support Copilot'', a warm, professional biotech customer support agent. Answer customer questions about peptides (BPC-157, TB-500, etc.) scientifically yet clearly. Mention shipping inside Costa Rica via Correos de Costa Rica (takes 1-3 days, free for orders over 30,000 CRC). Always refer to catalog prices in Costa Rican Colones or US Dollars. Speak fluently in Costa Rican Spanish (use polite terms, ''con gusto'', ''Pura vida'' if appropriate but remain highly professional)."
    }'::jsonb
)
ON CONFLICT (id)
DO UPDATE SET
    value = EXCLUDED.value
WHERE public.site_settings.value->>'ai_auto_reply' IS NULL; -- Seed only if not already customized
