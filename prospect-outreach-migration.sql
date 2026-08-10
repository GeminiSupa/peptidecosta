-- Prospect outreach and meeting booking.
-- Extends the Prospector workspace with AI-drafted 1:1 outreach and a
-- Cal.com booking loop. Run in the Supabase SQL Editor AFTER
-- prospector-migration.sql.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- A booked meeting is a real pipeline stage, not a flavour of "responded":
-- it is the outcome the whole outreach loop exists to produce, and reporting
-- on it only works if it cannot be confused with a prospect who merely wrote
-- back. The constraint is replaced rather than extended because Postgres has
-- no "add value to CHECK" — this is the same list plus 'meeting_booked'.
ALTER TABLE public.sales_prospects
  DROP CONSTRAINT IF EXISTS sales_prospects_status_check;

ALTER TABLE public.sales_prospects
  ADD CONSTRAINT sales_prospects_status_check CHECK (
    status IN (
      'discovered','review','qualified','contacted','responded',
      'meeting_booked','partner','won','lost','do_not_contact'
    )
  );

-- The booking token is what ties an anonymous Cal.com booking back to the
-- prospect it came from. It travels in the booking URL, so it must be
-- unguessable and must never be the prospect's own id.
ALTER TABLE public.sales_prospects
  ADD COLUMN IF NOT EXISTS booking_token TEXT,
  ADD COLUMN IF NOT EXISTS meeting_booked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS sales_prospects_booking_token_unique
  ON public.sales_prospects (booking_token)
  WHERE booking_token IS NOT NULL;

-- Every attempted send, successful or not. This is the audit trail for
-- "who did we contact, on what basis, with what words" — the question that
-- matters when a recipient complains or a regulator asks.
CREATE TABLE IF NOT EXISTS public.prospect_outreach (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL REFERENCES public.sales_prospects(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  to_identity TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  booking_url TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  provider_id TEXT,
  error TEXT,
  ai_model TEXT,
  permission_basis TEXT,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prospect_outreach_channel_check CHECK (channel IN ('email','whatsapp')),
  CONSTRAINT prospect_outreach_status_check CHECK (status IN ('sent','failed'))
);

CREATE INDEX IF NOT EXISTS prospect_outreach_prospect_idx
  ON public.prospect_outreach (prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.prospect_meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES public.sales_prospects(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'cal_com',
  provider_event_id TEXT NOT NULL,
  title TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  attendee_name TEXT,
  attendee_email TEXT,
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'booked',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prospect_meetings_status_check CHECK (status IN ('booked','rescheduled','cancelled'))
);

-- Cal.com retries webhooks. Without this the same booking would land two or
-- three times and the pipeline would report meetings that never existed.
CREATE UNIQUE INDEX IF NOT EXISTS prospect_meetings_provider_event_unique
  ON public.prospect_meetings (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS prospect_meetings_prospect_idx
  ON public.prospect_meetings (prospect_id, starts_at DESC);

ALTER TABLE public.prospect_outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_meetings ENABLE ROW LEVEL SECURITY;

-- As with sales_prospects, all reads and mutations go through authenticated
-- /api/admin/prospects routes (and the signature-verified Cal.com webhook)
-- using the service role, so no client-side policies are created here.
