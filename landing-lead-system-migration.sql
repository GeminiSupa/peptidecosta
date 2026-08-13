-- Landing-page lead qualification, consent, assignment, SLA, and alerts.
-- Additive and safe to re-run. Existing CRM leads and orders are not changed.

ALTER TABLE public.catalog_leads
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS qualification_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS consent_text TEXT,
  ADD COLUMN IF NOT EXISTS consent_version TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_due_at TIMESTAMPTZ;

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS lead_email_notifications BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS new_lead BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS catalog_leads_lead_source_idx
  ON public.catalog_leads(lead_source);
CREATE INDEX IF NOT EXISTS catalog_leads_qualification_data_idx
  ON public.catalog_leads USING GIN(qualification_data);
CREATE INDEX IF NOT EXISTS catalog_leads_response_due_idx
  ON public.catalog_leads(response_due_at)
  WHERE response_due_at IS NOT NULL AND status IN ('New', 'Contacted');

CREATE TABLE IF NOT EXISTS public.lead_round_robin_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton = true),
  last_agent_user_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.lead_round_robin_state(singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.lead_round_robin_state ENABLE ROW LEVEL SECURITY;

-- One transaction-level lock makes concurrent landing submissions rotate
-- deterministically instead of assigning the same staff member twice.
CREATE OR REPLACE FUNCTION public.assign_next_landing_lead_agent()
RETURNS TABLE(agent_name TEXT, agent_email TEXT, agent_user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_user UUID;
  selected_user UUID;
  selected_name TEXT;
  selected_email TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('landing-lead-round-robin'));

  SELECT last_agent_user_id
  INTO previous_user
  FROM public.lead_round_robin_state
  WHERE singleton = true
  FOR UPDATE;

  WITH eligible AS (
    SELECT
      user_id,
      COALESCE(NULLIF(TRIM(name), ''), email) AS display_name,
      email,
      ROW_NUMBER() OVER (ORDER BY LOWER(COALESCE(NULLIF(TRIM(name), ''), email)), user_id) AS position
    FROM public.admin_profiles
    WHERE user_id IS NOT NULL
      AND email IS NOT NULL
      AND COALESCE(status, 'active') = 'active'
      AND COALESCE(tier, 'staff') = 'staff'
      AND COALESCE(is_superadmin, false) = false
      AND COALESCE(permissions, '[]'::jsonb) ? 'leads'
      AND COALESCE(notifications_enabled, true) = true
      AND COALESCE(lead_email_notifications, true) = true
  ), current_position AS (
    SELECT position FROM eligible WHERE user_id = previous_user
  )
  SELECT user_id, display_name, email
  INTO selected_user, selected_name, selected_email
  FROM eligible
  WHERE position > COALESCE((SELECT position FROM current_position), 0)
  ORDER BY position
  LIMIT 1;

  IF selected_user IS NULL THEN
    SELECT user_id, display_name, email
    INTO selected_user, selected_name, selected_email
    FROM (
      SELECT
        user_id,
        COALESCE(NULLIF(TRIM(name), ''), email) AS display_name,
        email
      FROM public.admin_profiles
      WHERE user_id IS NOT NULL
        AND email IS NOT NULL
        AND COALESCE(status, 'active') = 'active'
        AND COALESCE(tier, 'staff') = 'staff'
        AND COALESCE(is_superadmin, false) = false
        AND COALESCE(permissions, '[]'::jsonb) ? 'leads'
        AND COALESCE(notifications_enabled, true) = true
        AND COALESCE(lead_email_notifications, true) = true
      ORDER BY LOWER(COALESCE(NULLIF(TRIM(name), ''), email)), user_id
      LIMIT 1
    ) first_agent;
  END IF;

  IF selected_user IS NULL THEN RETURN; END IF;

  UPDATE public.lead_round_robin_state
  SET last_agent_user_id = selected_user, updated_at = NOW()
  WHERE singleton = true;

  RETURN QUERY SELECT selected_name, selected_email, selected_user;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_next_landing_lead_agent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_next_landing_lead_agent() TO service_role;

INSERT INTO public.site_settings(id, value)
VALUES ('lead_landing_page', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Owner/operations backup destinations. The assigned agent is always added by
-- the application, so this flag is only for coverage when that person is away.
UPDATE public.notification_recipients
SET new_lead = true
WHERE channel = 'email'
  AND LOWER(destination) IN ('omerforce@gmail.com', 'info@peptidescostarica.net');

NOTIFY pgrst, 'reload schema';
