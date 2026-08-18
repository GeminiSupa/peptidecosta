/**
 * The campaign event tables were created straight in Supabase, and each names
 * its timestamp after its own verb rather than the `created_at` the rest of the
 * schema uses:
 *
 *   campaign_sends   sent_at
 *   campaign_opens   opened_at
 *   campaign_clicks  clicked_at
 *
 * Four separate places had guessed `created_at` and been wrong. Nothing shouted,
 * because every one of those reads sits behind a helper that logs and returns
 * an empty list — so the customer timeline quietly lost its email history and a
 * journey's "email engaged" branch silently answered no, forever.
 *
 * Queries go through here so the name is written down once, and the select
 * helper aliases the column to `at` so the rows come back the same shape
 * whichever table produced them.
 */

export const CAMPAIGN_EVENT_TIME_COLUMN = {
  campaign_sends: 'sent_at',
  campaign_opens: 'opened_at',
  campaign_clicks: 'clicked_at',
};

export function eventTimeColumn(table) {
  const column = CAMPAIGN_EVENT_TIME_COLUMN[table];
  if (!column) throw new Error(`No event timestamp column known for "${table}"`);
  return column;
}

/**
 * A PostgREST select list with the timestamp aliased to `at`.
 *
 * @param {string} table one of the campaign event tables
 * @param {string[]} columns other columns to select
 */
export function eventTimeSelect(table, columns = []) {
  return [...columns, `at:${eventTimeColumn(table)}`].join(', ');
}
