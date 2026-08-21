-- Durable Prospector enrichment queue.
-- Run once in the Supabase SQL Editor after prospector-migration.sql.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.prospect_enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL UNIQUE REFERENCES public.sales_prospects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  result_payload JSONB,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prospect_enrichment_jobs_status_check CHECK (
    status IN ('queued','running','succeeded','failed','cancelled')
  ),
  CONSTRAINT prospect_enrichment_jobs_attempts_check CHECK (
    attempts >= 0 AND max_attempts BETWEEN 1 AND 10
  )
);

CREATE INDEX IF NOT EXISTS prospect_enrichment_jobs_work_idx
  ON public.prospect_enrichment_jobs (status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS prospect_enrichment_jobs_updated_idx
  ON public.prospect_enrichment_jobs (updated_at DESC);

ALTER TABLE public.prospect_enrichment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can read prospect enrichment jobs"
  ON public.prospect_enrichment_jobs;

-- The queue is accessed only through authenticated admin API routes using the
-- service role. No direct browser policy is intentionally created.
