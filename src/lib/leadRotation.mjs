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
export async function resolveRotationAgent(supabase, settings) {
  if (settings?.assignmentMode !== 'rotation') return null;

  const { data: profiles, error } = await supabase
    .from('admin_profiles')
    .select('name, email, status, permissions');
  if (error) throw error;

  const agents = eligibleRotationAgents(profiles, settings.rotationAgentEmails);
  if (!agents.length) {
    console.warn('[lead-rotation] No chosen agent is active with the leads permission; lead left unassigned.');
    return null;
  }

  const { data: cursorRow } = await supabase
    .from('site_settings')
    .select('value')
    .eq('id', LANDING_ROTATION_SETTING_ID)
    .maybeSingle();
  const next = pickNextRotationAgent(agents, cursorRow?.value?.lastAgentEmail);

  const { error: writeError } = await supabase
    .from('site_settings')
    .upsert({ id: LANDING_ROTATION_SETTING_ID, value: { lastAgentEmail: next.email } });
  if (writeError) console.warn('[lead-rotation] Could not save the rotation pointer:', writeError.message);

  return next;
}
