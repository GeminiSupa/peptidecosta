const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_IN_TEXT_PATTERN = /[^\s<>()\[\],;:]+@[^\s<>()\[\],;:]+\.[A-Za-z]{2,}/;

export function normalizeCampaignEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

function leadName(lead) {
  const direct = String(lead?.name || '').trim();
  if (direct) return direct;
  return String(lead?.notes || '').match(/^Name:\s*(.+)$/im)?.[1]?.trim() || '';
}

export function emailFromLead(lead) {
  const direct = normalizeCampaignEmail(lead?.email);
  if (direct) return direct;

  const contact = normalizeCampaignEmail(lead?.contact_value);
  if (contact) return contact;

  const noteMatch = String(lead?.notes || '').match(EMAIL_IN_TEXT_PATTERN)?.[0];
  return normalizeCampaignEmail(noteMatch);
}

function normalizeTargetTags(tags) {
  return Array.isArray(tags) && tags.length ? tags : null;
}

// Marketing Studio keeps the audience radio and the audience tag in local state
// until someone saves the draft, but sending read the last *saved* campaign row.
// That gap let a send promise "1,481 recipients" and deliver to 43. The sender's
// live selection wins, and the caller persists it so later cron batches match.
export function resolveCampaignAudience(campaign = {}, audience = null) {
  const savedIncludeLeads = Boolean(campaign.include_leads);
  const savedTargetTags = normalizeTargetTags(campaign.target_tags);

  if (!audience) {
    return { includeLeads: savedIncludeLeads, targetTags: savedTargetTags, changed: false };
  }

  const includeLeads = audience.includeLeads === undefined
    ? savedIncludeLeads
    : Boolean(audience.includeLeads);
  const targetTags = audience.targetTags === undefined
    ? savedTargetTags
    : normalizeTargetTags(audience.targetTags);
  const changed = includeLeads !== savedIncludeLeads
    || JSON.stringify(targetTags) !== JSON.stringify(savedTargetTags);

  return { includeLeads, targetTags, changed };
}

export function leadSubscriberCandidates(leads = [], existingSubscribers = []) {
  const existingEmails = new Set(
    existingSubscribers.map(subscriber => normalizeCampaignEmail(subscriber?.email)).filter(Boolean),
  );
  const candidates = new Map();

  for (const lead of leads || []) {
    const email = emailFromLead(lead);
    if (!email || existingEmails.has(email)) continue;

    const fullName = leadName(lead);
    const [firstName = '', ...lastNameParts] = fullName.split(/\s+/).filter(Boolean);
    const previous = candidates.get(email);
    const tags = [...new Set([
      'crm_lead',
      ...(Array.isArray(previous?.tags) ? previous.tags : []),
      ...(Array.isArray(lead?.tags) ? lead.tags : []),
    ].filter(Boolean))];

    candidates.set(email, {
      id: previous?.id || `lead:${lead?.id || email}`,
      email,
      first_name: previous?.first_name || firstName || null,
      last_name: previous?.last_name || lastNameParts.join(' ') || null,
      tags,
      source: 'crm_lead',
      status: 'subscribed',
    });
  }

  return [...candidates.values()];
}
