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

export const AUDIENCE_SCOPES = ['subscribers', 'non_subscribers', 'leads', 'all'];

// A lead's address is copied into email_subscribers before it can be mailed,
// and the copied row is stamped with this source. It is the only durable way to
// tell the two apart afterwards: once a campaign has run, the subscriber table
// holds both, and "who signed up" cannot be recomputed from the list itself.
export const CRM_LEAD_SOURCE = 'crm_lead';

export function subscriberIsFromLead(subscriber) {
  return String(subscriber?.source || '').trim().toLowerCase() === CRM_LEAD_SOURCE;
}

/**
 * The four recipient groups, resolved from whichever field a caller has.
 *
 * `audience_scope` is authoritative; `include_leads` is the older boolean and
 * only says whether leads were in or out, so it can never mean "leads only".
 */
export function normalizeAudienceScope(value, fallbackIncludeLeads = false) {
  const scope = String(value || '').trim().toLowerCase();
  if (AUDIENCE_SCOPES.includes(scope)) return scope;
  return fallbackIncludeLeads ? 'all' : 'subscribers';
}

/** Whether the lead table has to be copied into subscribers for this send. */
export function scopeIncludesLeads(scope) {
  return scope === 'leads' || scope === 'non_subscribers' || scope === 'all';
}

export function scopeIncludesSubscribers(scope) {
  return scope === 'subscribers' || scope === 'all';
}

/**
 * Whether one subscriber row belongs in this scope.
 *
 * `isLeadAddress` is membership of the CRM lead table by email; `subscriber`
 * carries the source stamp. A person can be both — signed up through the form
 * AND present as a lead — which is what separates `leads` from
 * `non_subscribers`.
 */
export function subscriberMatchesScope(subscriber, scope, isLeadAddress) {
  switch (scope) {
    case 'subscribers':
      // Genuine signups only. Without this, the first campaign that included
      // leads would leave "subscribers only" quietly meaning everyone.
      return !subscriberIsFromLead(subscriber);
    case 'non_subscribers':
      return subscriberIsFromLead(subscriber);
    case 'leads':
      return Boolean(isLeadAddress);
    case 'all':
    default:
      return true;
  }
}

// Marketing Studio keeps the audience radio and the audience tag in local state
// until someone saves the draft, but sending read the last *saved* campaign row.
// That gap let a send promise "1,481 recipients" and deliver to 43. The sender's
// live selection wins, and the caller persists it so later cron batches match.
export function resolveCampaignAudience(campaign = {}, audience = null) {
  const savedScope = normalizeAudienceScope(campaign.audience_scope, campaign.include_leads);
  const savedTargetTags = normalizeTargetTags(campaign.target_tags);

  if (!audience) {
    return {
      scope: savedScope,
      includeLeads: scopeIncludesLeads(savedScope),
      targetTags: savedTargetTags,
      changed: false,
    };
  }

  // A caller that only knows the old boolean — a browser tab loaded before this
  // shipped, or the A/B winner path — must still be able to widen the audience.
  let scope = savedScope;
  if (audience.scope !== undefined) {
    scope = normalizeAudienceScope(audience.scope, audience.includeLeads);
  } else if (audience.includeLeads !== undefined) {
    scope = audience.includeLeads ? 'all' : 'subscribers';
  }
  const targetTags = audience.targetTags === undefined
    ? savedTargetTags
    : normalizeTargetTags(audience.targetTags);
  const changed = scope !== savedScope
    || JSON.stringify(targetTags) !== JSON.stringify(savedTargetTags);

  return { scope, includeLeads: scopeIncludesLeads(scope), targetTags, changed };
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
