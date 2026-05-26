-- Run this in your Supabase SQL Editor to add recovery tracking fields
ALTER TABLE public.abandoned_carts 
ADD COLUMN IF NOT EXISTS recovery_email_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recovery_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recovery_whatsapp_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recovery_whatsapp_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'es',
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CRC';
