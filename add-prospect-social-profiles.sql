-- add-prospect-social-profiles.sql
-- Run this in the Supabase SQL Editor to add social_profiles support to prospects

ALTER TABLE public.sales_prospects ADD COLUMN IF NOT EXISTS social_profiles jsonb DEFAULT '[]'::jsonb;
