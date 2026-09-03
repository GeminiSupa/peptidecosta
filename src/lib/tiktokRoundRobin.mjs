/**
 * Who the next TikTok Instant Form lead goes to.
 *
 * TikTok leads used to all go to one fixed agent (TIKTOK_ASSIGNEE_EMAIL in
 * tiktokLeadPosting.mjs). This spreads new leads across three agents instead —
 * Pollita, Dani, Korinne, in that fixed order — so no one of them is carrying
 * the whole channel.
 *
 * Only a genuinely NEW lead is rotated. A repeat submission from a contact who
 * already has a CRM lead keeps whoever owns it — the caller decides that by
 * checking for an existing lead before calling this, the same way every other
 * lead route treats an existing owner as a decision already made. Rotating on
 * every resubmission would otherwise bounce one person's lead between three
 * agents every time the same visitor filled the form again.
 *
 * The rotation pointer lives in site_settings, the same table
 * prospect-sweep's cursor uses. Two submissions arriving at the same instant
 * can both read the pointer before either writes it back and so land on the
 * same agent instead of alternating — acceptable for form-lead volume, and
 * cheaper than the coordination it would take to rule out.
 */

import { isUsableDestination, normalizeDestination } from './notificationRecipients.mjs';

export const TIKTOK_ROTATION_AGENT_NAMES = ['Pollita', 'Dani', 'Korinne'];
export const TIKTOK_ROTATION_SETTING_ID = 'tiktok_lead_rotation';

const lower = (value) => String(value ?? '').trim().toLowerCase();

/** The rotation's own agents, in rotation order, skipping anyone not eligible to work leads. */
function eligibleRotationAgents(profiles) {
  return TIKTOK_ROTATION_AGENT_NAMES
    .map((wanted) => (profiles || []).find((profile) => lower(profile?.name) === lower(wanted)))
    .filter((profile) => (
      profile
      && (profile.status || 'active') === 'active'
      && Array.isArray(profile.permissions)
      && profile.permissions.includes('leads')
    ))
    .map((profile) => ({
      name: String(profile.name || profile.email).trim(),
      email: lower(profile.email),
      whatsapp: isUsableDestination('whatsapp', profile.whatsapp_number)
        ? normalizeDestination('whatsapp', profile.whatsapp_number)
        : '',
    }));
}

/**
 * Advances the rotation and returns who this lead goes to, or null when none
 * of the three are active and working leads right now.
 */
export async function resolveNextTikTokAgent(supabase) {
  const { data: profiles, error } = await supabase
    .from('admin_profiles')
    .select('name, email, status, permissions, whatsapp_number');
  if (error) throw error;

  const eligible = eligibleRotationAgents(profiles);
  if (!eligible.length) return null;
  if (eligible.length === 1) return eligible[0];

  const { data: cursorRow } = await supabase
    .from('site_settings')
    .select('value')
    .eq('id', TIKTOK_ROTATION_SETTING_ID)
    .maybeSingle();
  const lastEmail = lower(cursorRow?.value?.lastAgentEmail);
  const lastIndex = eligible.findIndex((agent) => agent.email === lastEmail);
  const next = eligible[(lastIndex + 1) % eligible.length];

  const { error: writeError } = await supabase
    .from('site_settings')
    .upsert({ id: TIKTOK_ROTATION_SETTING_ID, value: { lastAgentEmail: next.email } });
  if (writeError) console.warn('[tiktok-round-robin] Could not save the rotation cursor:', writeError.message);

  return next;
}
