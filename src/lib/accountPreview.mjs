// Launch gate for the customer account area.
//
// The whole feature ships, but customers see "coming soon" until it is turned
// on deliberately. Gating in the UI rather than by removing routes means the
// switch is a single env var, and nothing has to be rebuilt or re-reviewed on
// launch day.
//
// This gate decides what to RENDER. It is not a security boundary and must
// never be treated as one — what a signed-in customer can actually read is
// decided by RLS on the database (orders_customer_read_own and friends).
// Someone who works out the preview parameter sees an unfinished feature, not
// anyone else's data.

/** localStorage key holding a granted preview, so the param is needed once. */
export const PREVIEW_STORAGE_KEY = 'account_preview_granted';

/** Query parameter that grants preview access, mirroring `?admin_preview=true`. */
export const PREVIEW_PARAM = 'account_preview';

/**
 * Has the feature been launched for everyone?
 *
 * Reads NEXT_PUBLIC_ACCOUNTS_LIVE. Next inlines NEXT_PUBLIC_* at build time, so
 * flipping this needs a redeploy — which is the point: launching is a decision,
 * not a toggle someone can trip by accident.
 */
export function isAccountsLive(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

/**
 * Should this visitor see the real account area?
 *
 * True when the feature is live for everyone, or when this browser has been
 * granted preview access — either by carrying the parameter right now, or by
 * having carried it earlier in the session.
 */
export function resolveAccountAccess({ live, paramValue, stored } = {}) {
  if (live) return true;
  if (String(paramValue ?? '').trim().toLowerCase() === 'true') return true;
  return stored === true || String(stored ?? '') === 'true';
}
