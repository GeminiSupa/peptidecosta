-- Marketing Studio campaign delivery health.
-- Run this in Supabase SQL Editor before relying on dashboard batch health.

CREATE TABLE IF NOT EXISTS public.campaign_delivery_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'scheduled', 'test_batch', 'winner', 'catalog_welcome')),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'partial', 'failed')),
  provider TEXT,
  fallback_provider TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  batch_size INTEGER NOT NULL DEFAULT 0,
  attempted INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  bounced INTEGER NOT NULL DEFAULT 0,
  total_eligible INTEGER NOT NULL DEFAULT 0,
  already_sent INTEGER NOT NULL DEFAULT 0,
  remaining_before_batch INTEGER NOT NULL DEFAULT 0,
  remaining_after_batch INTEGER,
  sender_host TEXT,
  fallback_host TEXT,
  error_message TEXT,
  provider_errors JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_delivery_batches_campaign_started
ON public.campaign_delivery_batches (campaign_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_delivery_batches_status_started
ON public.campaign_delivery_batches (status, started_at DESC);

ALTER TABLE public.campaign_delivery_batches ENABLE ROW LEVEL SECURITY;
