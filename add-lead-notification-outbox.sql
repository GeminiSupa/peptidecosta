-- Durable, observable delivery for CRM lead alerts.
--
-- The lead row and its notification job are committed by the same database
-- transaction through the trigger below. A serverless timeout after the lead
-- save therefore cannot silently lose Dani's email/WhatsApp alert: the pending
-- job remains available for the retry worker.
--
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.lead_notification_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid NOT NULL REFERENCES public.catalog_leads(id) ON DELETE CASCADE,
  enquiry_at       timestamptz NOT NULL,
  source           text NOT NULL DEFAULT 'contact_form',
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'delivered', 'partial', 'failed')),
  attempt_count    integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 5,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  locked_at        timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, enquiry_at)
);

CREATE INDEX IF NOT EXISTS lead_notification_jobs_ready_idx
  ON public.lead_notification_jobs (next_attempt_at, created_at)
  WHERE status IN ('pending', 'partial');

CREATE INDEX IF NOT EXISTS lead_notification_jobs_lead_idx
  ON public.lead_notification_jobs (lead_id, enquiry_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_notification_deliveries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               uuid NOT NULL REFERENCES public.lead_notification_jobs(id) ON DELETE CASCADE,
  channel              text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  destination          text NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  attempt_count        integer NOT NULL DEFAULT 0,
  provider_message_id  text,
  error_message        text,
  last_attempt_at      timestamptz,
  sent_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_notification_delivery_destination_key
  ON public.lead_notification_deliveries (job_id, channel, destination);

CREATE INDEX IF NOT EXISTS lead_notification_deliveries_job_idx
  ON public.lead_notification_deliveries (job_id, channel, status);

ALTER TABLE public.lead_notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_notification_jobs FROM anon, authenticated;
REVOKE ALL ON public.lead_notification_deliveries FROM anon, authenticated;

-- Targeted in-app notification for the assigned agent. Superadmins still see
-- it for operational oversight; other agents do not see another agent's lead.
ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_event_key_idx
  ON public.admin_notifications (event_key)
  WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_notifications_recipient_idx
  ON public.admin_notifications (lower(recipient_email), created_at DESC)
  WHERE recipient_email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_landing_lead_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  effective_enquiry_at timestamptz;
  effective_source text;
  target_email text;
BEGIN
  -- Only the qualified landing/ad forms generate operational alerts. Ordinary
  -- manual CRM rows and lightweight contact widgets keep their existing flow.
  IF NEW.qualification_data IS NULL OR NEW.qualification_data = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  effective_enquiry_at := COALESCE(NEW.last_enquiry_at, NEW.updated_at, NEW.created_at, now());
  effective_source := COALESCE(NULLIF(NEW.lead_source, ''), 'contact_form');

  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.last_enquiry_at, NEW.updated_at) IS NOT DISTINCT FROM
         COALESCE(OLD.last_enquiry_at, OLD.updated_at) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lead_notification_jobs (lead_id, enquiry_at, source)
  VALUES (NEW.id, effective_enquiry_at, effective_source)
  ON CONFLICT (lead_id, enquiry_at) DO UPDATE
    SET source = EXCLUDED.source,
        updated_at = now();

  SELECT profile.email
    INTO target_email
    FROM public.admin_profiles AS profile
   WHERE lower(COALESCE(profile.name, '')) = lower(COALESCE(NEW.sales_agent, ''))
      OR lower(COALESCE(profile.email, '')) = lower(COALESCE(NEW.sales_agent, ''))
   ORDER BY CASE WHEN lower(COALESCE(profile.name, '')) = lower(COALESCE(NEW.sales_agent, '')) THEN 0 ELSE 1 END
   LIMIT 1;

  INSERT INTO public.admin_notifications (
    type, title, body, link_tab, link_ref, recipient_email, event_key, created_at
  ) VALUES (
    'new_lead',
    CASE WHEN effective_source = 'adwords_lp' THEN 'New Google Ads lead' ELSE 'New landing-page lead' END,
    concat_ws(' — ', COALESCE(NULLIF(NEW.name, ''), 'New contact'), COALESCE(NULLIF(NEW.sales_agent, ''), 'Unassigned')),
    'leads',
    NEW.id::text,
    target_email,
    'lead:' || NEW.id::text || ':' || extract(epoch FROM effective_enquiry_at)::text,
    effective_enquiry_at
  )
  ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_lead_notification_outbox ON public.catalog_leads;
CREATE TRIGGER catalog_lead_notification_outbox
AFTER INSERT OR UPDATE OF last_enquiry_at ON public.catalog_leads
FOR EACH ROW EXECUTE FUNCTION public.enqueue_landing_lead_notification();

-- Claim one job atomically. The inline sender uses this immediately after a
-- lead save; the cron worker uses the batch form below for crash recovery.
CREATE OR REPLACE FUNCTION public.claim_lead_notification_job(p_job_id uuid)
RETURNS SETOF public.lead_notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.lead_notification_jobs AS job
     SET status = 'processing',
         attempt_count = job.attempt_count + 1,
         locked_at = now(),
         updated_at = now()
   WHERE job.id = p_job_id
     AND (
       job.status IN ('pending', 'partial')
       OR (job.status = 'processing' AND job.locked_at < now() - interval '10 minutes')
     )
     AND job.attempt_count < job.max_attempts
  RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_lead_notification_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.lead_notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ready AS (
    SELECT job.id
      FROM public.lead_notification_jobs AS job
     WHERE (
       (job.status IN ('pending', 'partial') AND job.next_attempt_at <= now())
       OR (job.status = 'processing' AND job.locked_at < now() - interval '10 minutes')
     )
       AND job.attempt_count < job.max_attempts
     ORDER BY job.next_attempt_at, job.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  )
  UPDATE public.lead_notification_jobs AS job
     SET status = 'processing',
         attempt_count = job.attempt_count + 1,
         locked_at = now(),
         updated_at = now()
    FROM ready
   WHERE job.id = ready.id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_landing_lead_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_lead_notification_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_lead_notification_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_lead_notification_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_lead_notification_jobs(integer) TO service_role;

COMMENT ON TABLE public.lead_notification_jobs IS
  'Durable outbox for landing-lead email and WhatsApp alerts.';
COMMENT ON TABLE public.lead_notification_deliveries IS
  'Per-recipient provider acceptance/failure audit for each lead alert job.';
