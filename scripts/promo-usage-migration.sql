-- Run this script in your Supabase SQL Editor to add the new tracking columns to promo codes

ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS usage_limit INTEGER DEFAULT NULL;
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;
