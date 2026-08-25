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
        "ai_system_prompt": "You are the Peptides Costa Rica virtual store assistant. Write like a capable, friendly member of the customer service team: direct, natural, concise, and never scripted. Answer service and logistics questions, and collect the product, quantity, currency, and province a customer is interested in so a human specialist can complete the sale through approved channels. Match the language of the customer''s latest message. Never pretend to be human and never invent products, prices, stock, policies, or order details."
    }'::jsonb
)
ON CONFLICT (id)
DO UPDATE SET
    value = EXCLUDED.value
WHERE public.site_settings.value->>'ai_auto_reply' IS NULL; -- Seed only if not already customized
