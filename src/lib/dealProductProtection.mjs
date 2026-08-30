/** Fields controlled by a live weekly deal and restored from its baseline. */
export const DEAL_PROTECTED_DB_FIELDS = Object.freeze([
  'price_usd',
  'price_crc',
  'original_price_usd',
  'original_price_crc',
  'discount',
  'sale_start_time',
  'sale_end_time',
]);

// The Products UI re-derives CRC from the latest exchange rate on every bulk
// save. That is not evidence of a stale tab, so CRC is preserved server-side
// instead of participating in the conflict decision.
export const DEAL_CONFLICT_FIELDS = DEAL_PROTECTED_DB_FIELDS.filter((field) => (
  field !== 'price_crc' && field !== 'original_price_crc'
));

const normalize = (value) => String(value || '').trim().toLowerCase();

export function comparable(field, value) {
  if (value === null || value === undefined || value === '') return null;
  if (field === 'sale_start_time' || field === 'sale_end_time') {
    const timestamp = Date.parse(value);
    // The Products datetime-local inputs intentionally display minute
    // precision, so a fresh row turns 12:34:56.789 into 12:34:00 on submit.
    // Compare the minute rather than treating that UI formatting as a stale edit.
    return Number.isFinite(timestamp) ? Math.floor(timestamp / 60000) : String(value);
  }
  return String(value);
}

/**
 * Has a deal-controlled field actually been changed by a person?
 *
 * The one definition, because there were two and they disagreed. This module
 * knew that a moved exchange rate and a minute-precision datetime input are not
 * manual edits; canSafelyRestoreProduct compared the same fields as raw
 * strings, so it answered "yes, edited" for two things nobody had touched:
 *
 *   price_crc        "₡57,198" vs "₡57,513"   — the exchange rate moved
 *   sale_end_time    "…999+00:00" vs "…999Z"  — the same instant, two formats
 *
 * The second one is not a drift that builds up over a week: Postgres returns
 * +00:00 and JSON.stringify of a Date writes Z, so it was true the moment the
 * snapshot was written, for every deal ever launched.
 */
export function dealFieldsMatch(current, expected, fields = DEAL_CONFLICT_FIELDS) {
  return fields.every((field) => (
    comparable(field, current?.[field]) === comparable(field, expected?.[field])
  ));
}

/**
 * A bulk Products save must not overwrite a price currently owned by a deal.
 * The submitted copy may come from another tab or browser loaded before launch.
 */
export function liveDealProductConflicts({ submittedRows = [], currentRows = [], productNames = [] }) {
  const submitted = new Map(submittedRows.map((row) => [normalize(row.product), row]));
  const current = new Map(currentRows.map((row) => [normalize(row.product), row]));
  const conflicts = [];

  for (const productName of productNames || []) {
    const key = normalize(productName);
    const next = submitted.get(key);
    const existing = current.get(key);
    if (!next || !existing) {
      conflicts.push(productName);
      continue;
    }
    if (DEAL_CONFLICT_FIELDS.some((field) => (
      comparable(field, next[field]) !== comparable(field, existing[field])
    ))) {
      conflicts.push(productName);
    }
  }

  return [...new Set(conflicts)];
}

/** Keep every deal-controlled value byte-for-byte while saving other fields. */
export function preserveLiveDealFields(submittedRows = [], currentRows = [], productNames = []) {
  const names = new Set((productNames || []).map(normalize));
  const current = new Map(currentRows.map((row) => [normalize(row.product), row]));
  return (submittedRows || []).map((row) => {
    const key = normalize(row.product);
    const existing = current.get(key);
    if (!names.has(key) || !existing) return row;
    const protectedValues = Object.fromEntries(
      DEAL_PROTECTED_DB_FIELDS.map((field) => [field, existing[field] ?? null]),
    );
    return { ...row, ...protectedValues };
  });
}
