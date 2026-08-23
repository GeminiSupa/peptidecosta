/**
 * The agent a paid campaign is currently pointed at.
 *
 * Two places need this answer and must not disagree: /api/leads/contact, which
 * assigns the lead as it arrives, and the notification outbox, which re-derives
 * everything from the saved row when it retries. If only the first knew who the
 * campaign agent was, a retried alert would quietly put her back on a lead that
 * belongs to a colleague — the exact thing the exclusion exists to prevent.
 */

import {
  DEFAULT_LANDING_LEAD_SETTINGS,
  LANDING_LEAD_SETTINGS_ID,
  normalizeLandingLeadSettings,
} from '@/lib/landingLeadSettings.mjs';

/** Landing-page lead settings, falling back to the defaults on any read failure. */
export async function loadLandingLeadSettings(supabase) {
  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('id', LANDING_LEAD_SETTINGS_ID)
      .maybeSingle();
    return normalizeLandingLeadSettings(data?.value);
  } catch (error) {
    console.warn('[leads] Lead settings fallback:', error.message);
    return DEFAULT_LANDING_LEAD_SETTINGS;
  }
}

/**
 * The single agent every campaign lead goes to while assignmentMode is 'fixed'.
 *
 * Returns null rather than throwing if that agent has since been deactivated or
 * lost the leads permission, so the caller falls back to rotation: a campaign
 * lead must never be left unowned because a setting went stale.
 */
export async function resolveCampaignAgent(supabase, settings) {
  if (settings?.assignmentMode !== 'fixed') return null;
  const wanted = String(settings.assignedAgentEmail || '').trim().toLowerCase();
  if (!wanted) return null;

  const { data: profiles, error } = await supabase.from('admin_profiles').select('*');
  if (error) throw error;
  const match = (profiles || []).find((profile) =>
    String(profile.email || '').trim().toLowerCase() === wanted
  );
  if (!match) {
    console.warn(`[leads] Fixed assignee ${wanted} is not a team member; falling back to round-robin.`);
    return null;
  }
  const eligible = (match.status || 'active') === 'active'
    && Array.isArray(match.permissions) && match.permissions.includes('leads');
  if (!eligible) {
    console.warn(`[leads] Fixed assignee ${wanted} is inactive or lacks the leads permission; falling back to round-robin.`);
    return null;
  }
  return {
    name: String(match.name || match.email || '').trim().slice(0, 160),
    email: String(match.email || '').trim().toLowerCase().slice(0, 200),
  };
}
