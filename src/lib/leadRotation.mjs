/**
 * Round-robin for new landing-page leads (/lp, /glp-1, /landing).
 *
 * The admin picks the agents in Lead settings; each genuinely new lead goes to
 * the next one in that list. Offline agents are still assigned: a lead that
 * arrives at night must have an owner in the morning, not sit unclaimed.
 *
 * The previous rotation (retired 2026-08-22) never assigned a lead because it
 * depended on a database function that was never migrated. This one needs no
 * migration: the pointer lives in site_settings, like the TikTok rotation.
 * Two submissions in the same instant can land on the same agent — acceptable
 * at form-lead volume.
 */

export const LANDING_ROTATION_SETTING_ID = 'landing_lead_rotation';

import { isInternalStaff } from './subUserTier.mjs';

const lower = (value) => String(value ?? '').trim().toLowerCase();

/** The chosen agents that can work leads right now, in the admin's order. */
export function eligibleRotationAgents(profiles, rotationEmails) {
  const seen = new Set();
  return (rotationEmails || [])
    .map(lower)
    .filter((email) => email && !seen.has(email) && seen.add(email))
    .map((email) => (profiles || []).find((profile) => lower(profile?.email) === email))
    .filter((profile) => (
      profile
      && (profile.status || 'active') === 'active'
      // Staff only, whatever permissions the row happens to carry. A customer's
      // lead is not something to hand to an outside affiliate, and an affiliate
      // made the old way through Team can still be holding real permissions.
      && isInternalStaff(profile)
      && Array.isArray(profile.permissions)
      && profile.permissions.includes('leads')
    ))
    .map((profile) => ({
      name: String(profile.name || profile.email).trim().slice(0, 160),
      email: lower(profile.email),
    }));
}

/** The agent after lastEmail, wrapping around; the first agent if lastEmail is unknown. */
export function pickNextRotationAgent(agents, lastEmail) {
  if (!agents?.length) return null;
  const lastIndex = agents.findIndex((agent) => agent.email === lower(lastEmail));
  return agents[(lastIndex + 1) % agents.length];
}

/**
 * Advances the rotation and returns { name, email }, or null when rotation is
 * off or none of the chosen agents can take leads.
 */
/** The ticked agents for one source. */
export function rotationAgentEmailsFor(settings, source = 'googleAds') {
  if (source === 'tiktok') return settings?.tiktokAgentEmails || [];
  return settings?.googleAdsAgentEmails || [];
}

/**
 * Where each source keeps its place in its own list. Google Ads keeps the
 * original key so its rotation carries on from whoever was last, rather than
 * restarting at the top of the list the day this ships.
 */
const CURSOR_KEY = { googleAds: 'lastAgentEmail', tiktok: 'lastAgentEmailTiktok' };

/**
 * Advances one source's rotation and returns { name, email }, or null when
 * rotation is off for it or none of its chosen agents can take leads.
 *
 * The two sources hold separate places in separate lists: a TikTok lead must
 * not push the Google Ads rotation on a step, which is what a single shared
 * pointer did.
 */
export async function resolveRotationAgent(supabase, settings, source = 'googleAds') {
  if (settings?.assignmentMode !== 'rotation') return null;

  const { data: profiles, error } = await supabase
    .from('admin_profiles')
    .select('name, email, status, permissions');
  if (error) throw error;

  const agents = eligibleRotationAgents(profiles, rotationAgentEmailsFor(settings, source));
  if (!agents.length) {
    console.warn(`[lead-rotation] No ${source} agent is active with the leads permission; lead left unassigned.`);
    return null;
  }

  const cursorKey = CURSOR_KEY[source] || CURSOR_KEY.googleAds;
  const { data: cursorRow } = await supabase
    .from('site_settings')
    .select('value')
    .eq('id', LANDING_ROTATION_SETTING_ID)
    .maybeSingle();
  const next = pickNextRotationAgent(agents, cursorRow?.value?.[cursorKey]);

  // The other source's place is read back and written again untouched, since
  // both live in this one row.
  const { error: writeError } = await supabase
    .from('site_settings')
    .upsert({
      id: LANDING_ROTATION_SETTING_ID,
      value: { ...(cursorRow?.value || {}), [cursorKey]: next.email },
    });
  if (writeError) console.warn('[lead-rotation] Could not save the rotation pointer:', writeError.message);

  return next;
}
