/**
 * Marketing attribution carried on an order.
 *
 * These columns are UUIDs in Postgres, but the values reach them from a URL:
 * UTMTracker stores whatever sits in `?utm_campaign=`, and the admin Share
 * Links tab lets anyone type a free-text campaign name into that parameter.
 * A human-readable slug like "tesa20_flash_sale" therefore reached a uuid
 * column and Postgres rejected the whole INSERT — so every customer who
 * clicked that link had checkout broken for the 30 days the value was cached.
 *
 * An order is worth more than its marketing tag. Anything that is not a valid
 * UUID is dropped and the sale goes through.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Columns on `orders` typed as uuid that are fed from user-controlled input. */
export const ATTRIBUTION_UUID_FIELDS = [
  'campaign_id',
  'journey_id',
  'journey_enrollment_id',
  'journey_step_id',
  'affiliate_id',
];

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/**
 * Returns a copy of the order with unusable attribution removed, plus the list
 * of fields that were dropped so the cause stays visible in the logs.
 * Null and undefined are left alone — they are already valid for these columns.
 *
 * A dropped `campaign_id` is not thrown away. Values like "tesa15_flash_sale"
 * are share-link labels typed in the admin Share Links tab, not campaign
 * records — there is nothing to resolve them against, so forcing them into the
 * uuid column was never going to work. They are kept verbatim in `utm_campaign`
 * instead, so the sale still carries the label that won it and the marketing
 * credit survives. That column is optional: ORDER_ATTRIBUTION_COLUMNS lets the
 * insert drop it on a database where the migration has not been run, because an
 * order is still worth more than its marketing tag.
 */
export function sanitizeOrderAttribution(order) {
  if (!order || typeof order !== 'object') return { order, dropped: [] };

  const sanitized = { ...order };
  const dropped = [];

  for (const field of ATTRIBUTION_UUID_FIELDS) {
    const value = sanitized[field];
    if (value === undefined || value === null || value === '') continue;
    if (isUuid(value)) continue;

    const label = String(value).slice(0, 60);
    dropped.push({ field, value: label });
    sanitized[field] = null;

    // Only campaign_id has a human-readable counterpart worth keeping. A
    // malformed journey or affiliate id is a bug, not a label.
    if (field === 'campaign_id' && !sanitized.utm_campaign) {
      sanitized.utm_campaign = label;
    }
  }

  return { order: sanitized, dropped };
}
