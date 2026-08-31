-- Make the in-app bell say the same thing the lead alert emails say.
--
-- The trigger writes both the outbox job and the admin_notifications row, and
-- its title was hardcoded here while the email wording lives in JS
-- (leadNotificationTitle in src/lib/tiktokLeadPosting.mjs). The two drifted:
-- every lead that was not from Google Ads was announced as a "landing-page
-- lead", including the storefront Contáctenos dialog on the home page, the
-- catalog, the FAQ and the affiliate pages — and a TikTok lead, which has its
-- own funnel, was called a landing-page lead too.
--
-- Now matched to the JS, source for source:
--
--   tiktok_form   -> New TikTok form lead
--   adwords*      -> New AdWords lead      (the prefix, so the standalone
--                                           AdWordsLeadForm's own
--                                           'adwords_landing' is caught as
--                                           well as 'adwords_lp')
--   anything else -> New website enquiry
--
-- Only the CASE changed. Everything else in this function is reproduced
-- verbatim from add-lead-notification-outbox.sql, because CREATE OR REPLACE
-- swaps the whole body and dropping a line here would quietly stop the outbox
-- job or the deduplication working.
--
-- No trigger to recreate: catalog_lead_notification_outbox binds to this
-- function by name and picks up the new body on its own.
--
-- Safe to run more than once.

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
    CASE
      WHEN lower(effective_source) = 'tiktok_form' THEN 'New TikTok form lead'
      WHEN lower(effective_source) LIKE 'adwords%' THEN 'New AdWords lead'
      ELSE 'New website enquiry'
    END,
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
