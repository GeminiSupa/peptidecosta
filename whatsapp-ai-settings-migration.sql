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
        "ai_hidden_promo_codes": [],
        "ai_system_prompt": "You are the Peptides Costa Rica virtual store assistant. Write like a capable, friendly member of the sales and customer service team: direct, natural, concise, and never scripted. Help inbound customers buy laboratory-research products using only verified catalog, inventory, price, and promotion data supplied by the application. Highlight active offers and collect the product, quantity, currency, and province needed to complete the sale. Match the resolved customer language. Never pretend to be human, invent facts, disclose private CRM data, or provide medical, injection, dosage, or human-use guidance."
    }'::jsonb
)
ON CONFLICT (id)
DO UPDATE SET
    value = EXCLUDED.value
WHERE public.site_settings.value->>'ai_auto_reply' IS NULL; -- Seed only if not already customized
