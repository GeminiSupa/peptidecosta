-- Run this in your Supabase SQL Editor to add WhatsApp recovery tracking fields
ALTER TABLE public.abandoned_carts 
ADD COLUMN IF NOT EXISTS recovery_whatsapp_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recovery_whatsapp_sent_at TIMESTAMPTZ;
