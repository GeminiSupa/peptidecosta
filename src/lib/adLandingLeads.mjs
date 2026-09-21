/**
 * Which CRM leads came from the paid Google Ads pages. Pure, so the admin
 * screen, the server and the tests share it.
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
