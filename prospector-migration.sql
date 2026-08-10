-- Prospect discovery workspace.
-- Discovered businesses stay separate from catalog_leads and marketing audiences.
-- Run in the Supabase SQL Editor before using the Prospector admin tab.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.sales_prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_provider TEXT NOT NULL DEFAULT 'manual',
  source_external_id TEXT,
  organization_name TEXT NOT NULL,
  category TEXT,
  website_url TEXT,
  phone TEXT,
  email TEXT,
  formatted_address TEXT,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'Costa Rica',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  google_maps_url TEXT,
  rating NUMERIC(3,2),
  user_rating_count INTEGER,
  business_status TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  fit_score INTEGER NOT NULL DEFAULT 0,
  fit_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact_permission_status TEXT NOT NULL DEFAULT 'unknown',
  contact_source_url TEXT,
  enriched_at TIMESTAMPTZ,
  people JSONB NOT NULL DEFAULT '[]'::jsonb,
  linkedin_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_email TEXT,
  notes TEXT NOT NULL DEFAULT '',
  last_contacted_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_prospects_status_check CHECK (
    status IN ('discovered','review','qualified','contacted','responded','partner','won','lost','do_not_contact')
  ),
  CONSTRAINT sales_prospects_permission_check CHECK (
    contact_permission_status IN ('unknown','business_contact','consented','do_not_contact')
  ),
  CONSTRAINT sales_prospects_score_check CHECK (fit_score BETWEEN 0 AND 100),
  CONSTRAINT sales_prospects_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT sales_prospects_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_prospects_provider_external_unique
  ON public.sales_prospects (source_provider, source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_prospects_status_idx
  ON public.sales_prospects (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS sales_prospects_owner_idx
  ON public.sales_prospects (owner_email, next_follow_up_at);

ALTER TABLE public.sales_prospects ENABLE ROW LEVEL SECURITY;

-- Safe upgrades for installations that ran an earlier Prospector migration.
ALTER TABLE public.sales_prospects
  ADD COLUMN IF NOT EXISTS contact_source_url TEXT,
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS people JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

DROP POLICY IF EXISTS "Authenticated staff can read sales prospects" ON public.sales_prospects;

-- All reads and mutations go through authenticated /api/admin/prospects routes.
-- Those routes enforce module permissions before using the service role, so no
-- client-side policies are intentionally created here.
