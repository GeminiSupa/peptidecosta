-- The Marketing Studio template picker was a hardcoded array in
-- CampaignBuilder.js, so a layout somebody had already built and proved could
-- never become a starting point. The only way to reuse one was to duplicate a
-- campaign and edit the copy, which drags the old subject, audience and tags
-- along with the design.
--
-- Saved templates are design-only on purpose: a template is a layout, not a
-- campaign. Subject is kept because it is usually a pattern worth reusing, and
-- it is only ever a prefill.
--
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.email_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  subject_line TEXT,
  design_json  JSONB NOT NULL,
  html_content TEXT,
  icon         TEXT NOT NULL DEFAULT '💾',
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_templates_created_at_idx
  ON public.email_templates (created_at DESC);

-- Reached only through the admin API on the service role, same as campaigns.
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY email_templates_service_role ON public.email_templates
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
