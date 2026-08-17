// Customer account identity rules.
//
// Historical orders are attached to a new account by matching the verified
// login email against orders.customer_email. That match is only safe because
// two categories of address are excluded first:
//
//   1. Staff addresses. Agents close orders on a customer's behalf and some of
//      them typed their own email into the customer field — one address carries
//      24 orders under 24 different customer names. Left unguarded, a staff
//      member logging in as a customer would read two dozen strangers' names,
//      phones and shipping addresses.
//   2. Placeholder addresses. abc@abc.com carries 25 orders under 25 names.
//      Both of those domains resolve, so whoever controls the mailbox could
//      claim the lot.
//
// Both categories are materialised into public.order_claim_blocklist, which the
// server seeds from live data and an admin can edit. This module holds the
// pure rules so they can be tested without a database, and so the same
// decisions govern both directions: what may be claimed, and who may register
// an account at all.

/** Fold an address to its comparison form. Returns null for anything empty. */
export function normalizeEmail(value) {
  const trimmed = String(value ?? '').trim().toLowerCase();
  return trimmed || null;
}

/**
 * Build the lookup a claim pass consults.
 *
 * Rows arrive straight from order_claim_blocklist, so they get normalized here
 * rather than trusting whatever casing was inserted.
 */
export function buildClaimBlocklist(rows = []) {
  const blocked = new Set();
  for (const row of rows || []) {
    const email = normalizeEmail(typeof row === 'string' ? row : row?.email);
    if (email) blocked.add(email);
  }
  return blocked;
}

/**
 * May this address own an account and claim history?
 *
 * The same answer gates registration and claiming. Gating only the claim would
 * leave the account itself standing, so a later loosening of the claim rules —
 * or an admin attaching an order by hand — would hand the history over after
 * all.
 */
export function isEmailClaimable(email, blocklist) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (!blocklist) return true;
  const has = typeof blocklist.has === 'function'
    ? (value) => blocklist.has(value)
    : (value) => Boolean(blocklist[value]);
  return !has(normalized);
}

/**
 * Pick the orders a freshly verified account may take ownership of.
 *
 * An order qualifies only when it is still unowned and its recorded email
 * matches the verified login. Orders already carrying a customer_user_id are
 * left alone even when the email matches, so a support correction is never
 * silently undone by the owner's next login.
 */
export function selectClaimableOrders(orders = [], { email, blocklist } = {}) {
  const target = normalizeEmail(email);
  if (!target) return [];
  if (!isEmailClaimable(target, blocklist)) return [];

  return (orders || []).filter((order) => (
    !order?.customer_user_id
    && normalizeEmail(order?.customer_email) === target
  ));
}

/**
 * The profile row written on first verified login.
 *
 * Locale defaults to Spanish to match the storefront, and the display name is
 * seeded from whatever the customer last typed at checkout so the dashboard is
 * not greeting them by email address.
 */
export function buildCustomerProfileRow({ userId, email, displayName, phone, locale } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!userId || !normalizedEmail) return null;

  const requested = String(locale || '').toLowerCase();
  return {
    user_id: userId,
    email: normalizedEmail,
    display_name: String(displayName || '').trim() || null,
    phone: String(phone || '').trim() || null,
    locale: requested === 'en' ? 'en' : 'es',
  };
}
