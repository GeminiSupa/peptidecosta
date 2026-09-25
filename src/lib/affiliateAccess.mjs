/**
 * The affiliate dashboard: four screens, and the rules that keep it to four.
 *
 * An affiliate is an outside partner who earns commission on orders placed with
 * their code. They get a login so they can watch their own numbers without
 * asking anyone. They are NOT staff, and the admin they log into is not the
 * admin the team uses — it is these four screens and nothing else:
 *
 *   my_links     their promo code, QR and catalog link
 *   my_sales     orders placed with their code (order no., customer name,
 *                products, total — no phone, email or address)
 *   my_payouts   what they are owed, what has been approved, what was paid
 *   my_account   their own contact details
 *
 * WHY AN ALLOW-LIST AND NOT A PERMISSION TICK-BOX
 *
 * Hiding a tab hides a button, not the page behind it. Most admin routes are
 * gated on nothing more than "does this person have an admin_profiles row",
 * which is safe while every login belongs to the team and stops being safe the
 * moment a login is handed to an outsider. So verifyAdminSession refuses this
 * tier everywhere by default and the affiliate routes opt in with
 * { allowAffiliate: true }. Default-deny means the other 85 routes need no
 * audit and no edit.
 *
 * WHICH AFFILIATE IS THIS? — always answered from the session, never from the
 * request. See affiliateIdForProfile: the browser cannot ask for someone
 * else's rows because it never gets to name an affiliate at all.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

/** Look, change nothing. */
export const AFFILIATE_ACCESS_READ = 'read';
/** Look, and correct their own contact details. Never anything with money on it. */
export const AFFILIATE_ACCESS_READ_WRITE = 'read_write';

export const AFFILIATE_ACCESS_MODES = [AFFILIATE_ACCESS_READ, AFFILIATE_ACCESS_READ_WRITE];

/**
 * Read-only is the default for a missing or unrecognised value, so a
 * half-applied migration, a typo or a hand-edited row can only ever take
 * permission away, never hand it out.
 */
export function affiliateAccessMode(profile) {
  const mode = String(profile?.affiliate_access ?? '').trim().toLowerCase();
  return mode === AFFILIATE_ACCESS_READ_WRITE ? AFFILIATE_ACCESS_READ_WRITE : AFFILIATE_ACCESS_READ;
}

export function affiliateCanWrite(profile) {
  return affiliateAccessMode(profile) === AFFILIATE_ACCESS_READ_WRITE;
}

/** The whole dashboard. Four ids, and adding a fifth is a deliberate act. */
export const AFFILIATE_TAB_IDS = new Set(['my_links', 'my_sales', 'my_payouts', 'my_account']);

export function affiliateCanSeeTab(tabId) {
  return AFFILIATE_TAB_IDS.has(tabId);
}

/**
 * The affiliate row this login belongs to, or null.
 *
 * `affiliates.admin_profile_user_id` is the join. It is the ONLY way any
 * affiliate screen decides whose rows to show — no id from the query string,
 * no id from the body. An affiliate with no link reaches nothing rather than
 * everything, which is the safe direction to fail in.
 */
export function affiliateIdForProfile(profile, affiliates = []) {
  const userId = profile?.user_id;
  if (!userId) return null;
  const match = (affiliates || []).find((row) => row?.admin_profile_user_id === userId);
  return match?.id || null;
}

/**
 * What an affiliate is allowed to know about a customer who used their code.
 *
 * Their name, what they bought, what it cost, and the order number — enough to
 * recognise their own referral and check their commission. Deliberately no
 * phone, no email, no address: an affiliate list is not a customer list, and a
 * login handed to an outside partner must not become one.
 */
export function affiliateSafeOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    order_number: order.order_number ?? null,
    created_at: order.created_at ?? null,
    status: order.status ?? null,
    customer_name: order.customer_name ?? null,
    items: order.items ?? null,
    total_usd: order.total_usd ?? null,
    total_crc: order.total_crc ?? null,
    currency: order.currency ?? null,
    affiliate_commission_usd: order.affiliate_commission_usd ?? null,
    affiliate_commission_crc: order.affiliate_commission_crc ?? null,
  };
}
