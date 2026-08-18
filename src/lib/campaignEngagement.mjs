/**
 * Campaign rate maths, in one place so the dashboard and the campaign detail
 * view cannot drift apart.
 *
 * Every rate here is per *person*, not per event. The trackers write one row
 * each time a pixel loads or a link is followed, so raw counts answer "how many
 * times", never "how many people" — and dividing one raw count by another
 * produced a click rate that could exceed 100%, because image-blocking clients
 * follow links without ever loading the pixel.
 */

function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
}

function rate(numerator, denominator) {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

/**
 * Normalise whatever the API returned — the engagement view when the migration
 * has been run, raw embedded counts when it has not — into one shape.
 */
export function campaignEngagement(campaign = {}) {
  const stats = campaign.engagement || {};

  const sends = toCount(stats.sends ?? campaign.campaign_sends?.[0]?.count);
  const totalOpens = toCount(stats.total_opens ?? campaign.campaign_opens?.[0]?.count);
  const totalClicks = toCount(stats.total_clicks ?? campaign.campaign_clicks?.[0]?.count);

  // Without the view we cannot know how many *people* opened, only how many
  // times. Saying so beats quietly presenting the inflated number as a rate.
  const exact = stats.unique_opens !== undefined || stats.unique_clicks !== undefined;
  const uniqueOpens = exact ? toCount(stats.unique_opens) : Math.min(totalOpens, sends);
  const uniqueClicks = exact ? toCount(stats.unique_clicks) : Math.min(totalClicks, sends);

  return {
    exact,
    sends,
    totalOpens,
    totalClicks,
    uniqueOpens,
    uniqueClicks,
    // Share of recipients who opened at least once.
    openRate: rate(uniqueOpens, sends),
    // Share of recipients who clicked at least once. Rated against sends, not
    // opens — that is what every benchmark you would compare against means.
    clickRate: rate(uniqueClicks, sends),
    // Of the people who opened, how many clicked. The copy/design metric.
    clickToOpenRate: rate(uniqueClicks, uniqueOpens),
  };
}

/** Roll a list of campaigns up into the same shape for the KPI strip. */
export function totalEngagement(campaigns = []) {
  const rows = campaigns.map(campaignEngagement);
  const sum = key => rows.reduce((total, row) => total + row[key], 0);

  const sends = sum('sends');
  const uniqueOpens = sum('uniqueOpens');
  const uniqueClicks = sum('uniqueClicks');

  return {
    exact: rows.every(row => row.exact),
    sends,
    totalOpens: sum('totalOpens'),
    totalClicks: sum('totalClicks'),
    uniqueOpens,
    uniqueClicks,
    openRate: rate(uniqueOpens, sends),
    clickRate: rate(uniqueClicks, sends),
    clickToOpenRate: rate(uniqueClicks, uniqueOpens),
  };
}
