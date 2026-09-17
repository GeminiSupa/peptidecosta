/**
 * Which CRM leads came from the paid Google Ads pages, and how their Chatwoot
 * delivery went. Pure, so the admin screen, the server and the tests share it.
 *
 * `glp1_lp` is /glp-1 and `adwords_lp` is /lp. The Leads tab used to look for
 * the word "adwords" only, which hid every /glp-1 lead from its own Google Ads
 * filter. Any new ad page needs its source added here.
 */
export const AD_LANDING_SOURCES = new Set(['adwords_lp', 'glp1_lp']);

const lower = (value) => String(value ?? '').trim().toLowerCase();

/** The ad-page source a lead arrived from, or '' if it did not. */
export function adLandingSourceOf(lead) {
  const direct = lower(lead?.lead_source);
  if (AD_LANDING_SOURCES.has(direct)) return direct;
  // Leads saved before lead_source existed only say it in the note's first line.
  const match = String(lead?.notes || '').match(/\((adwords_lp|glp1_lp)\)/i);
  return match ? match[1].toLowerCase() : '';
}

export const isAdLandingLead = (lead) => Boolean(adLandingSourceOf(lead));

export const adLandingPageLabel = (lead) => (adLandingSourceOf(lead) === 'glp1_lp' ? '/glp-1' : '/lp');

/**
 * What the Leads tab shows for a lead's Chatwoot chat. `tone` is one of
 * ok | warn | bad | muted.
 */
export function chatwootStatusView(lead) {
  const error = String(lead?.chatwoot_error || '').trim();
  switch (lower(lead?.chatwoot_status)) {
    case 'sent':
      return { tone: 'ok', text: 'Chat created', detail: '' };
    case 'unassigned':
      return { tone: 'warn', text: 'Chat created, no agent', detail: error };
    case 'failed':
      return { tone: 'bad', text: 'Chat NOT created', detail: error };
    case 'not_configured':
      return { tone: 'bad', text: 'Chatwoot not set up', detail: 'Chatwoot settings are missing on the server' };
    case 'off':
      return { tone: 'muted', text: 'Chatwoot switched off', detail: 'Team → Notification Settings' };
    default:
      return { tone: 'muted', text: 'Not recorded', detail: 'Saved before Chatwoot tracking existed' };
  }
}

/** A lead whose chat needs a human: it failed, or nobody was assigned. */
export const chatwootNeedsAttention = (lead) => ['bad', 'warn'].includes(chatwootStatusView(lead).tone);
