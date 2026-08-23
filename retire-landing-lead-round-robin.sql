-- Retire the landing-lead round-robin.
--
-- It was built to spread new landing-page leads across every eligible agent,
-- but it never assigned a single one. The setting has been 'fixed' (one
-- campaign agent) since the Google Ads page went live, so the rotation was only
-- ever reachable as a fallback for a deactivated campaign agent — a case that
-- has not occurred. Every auto-assignment in lead_assignment_events reads
-- either "configured to go to a single agent" or a returning-customer reason.
--
-- The application no longer calls assign_next_landing_lead_agent(), so this only
-- removes what is already unused. Run it AFTER deploying the code that drops the
-- call, not before: an older deployment still calling the function would fall
-- back to its in-application rotation, which is harmless but pointless.
--
-- What replaces it: nothing. A lead the campaign agent cannot take is now left
-- unassigned and claimable in the Leads tab, which is visible, rather than
-- handed to whoever the rotation happened to land on. A contact an agent already
-- owns is unaffected either way — that is decided before assignment ever runs.
--
-- Safe to run more than once.

DROP FUNCTION IF EXISTS public.assign_next_landing_lead_agent();

-- The rotation pointer. Only the function above ever read or wrote it.
DROP TABLE IF EXISTS public.lead_round_robin_state;

-- Leave site_settings.lead_landing_page alone. Rows may still hold
-- assignmentMode = 'round_robin'; normalizeLandingLeadSettings maps any value
-- other than 'fixed' to 'unassigned', so a stored setting keeps working and
-- needs no rewrite here.
