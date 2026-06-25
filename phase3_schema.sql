-- Phase 3 Schema Updates

-- 1. Add E-commerce Attribution to Orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL;

-- 2. Add A/B Testing fields to Campaigns
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS subject_line_b VARCHAR(255);
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS is_ab_test BOOLEAN DEFAULT false;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS target_tags TEXT[]; -- The segment it was sent to

-- 3. Add Variant Tracking to Sends (so we know which user got which subject line)
ALTER TABLE public.campaign_sends ADD COLUMN IF NOT EXISTS subject_variant VARCHAR(1) DEFAULT 'A'; -- 'A' or 'B'
