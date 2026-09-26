/**
 * What an affiliate earns on an order.
 *
 * This arithmetic used to live in two places that disagreed about who was
 * allowed to do it. The admin panel computed it here, from the affiliate's own
 * stored rate. The public checkout did not compute it at all — the browser sent
 * `affiliate_commission_usd` and `affiliate_commission_crc` in the order body
 * and /api/orders/create wrote them down as given.
 *
 * Nothing downstream ever questioned those numbers. The weekly affiliate scan
 * sums the column straight off the order row and puts the result on an invoice
 * that a superadmin approves and pays. So the amount an affiliate was paid was,
 * on the storefront path, a figure supplied by whoever placed the order.
 *
 * One function now, used by both routes: the rate comes from the affiliates
 * table, the base comes from the order, and the caller supplies neither.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

export const AFFILIATE_HANDLER_COMMISSION_RATE = 5;

/**
 * Commission is earned on merchandise the customer kept.
 *
 * Never on the shipping fee, and never on money given back. The refund was the
 * missing half: this read the order total, so an affiliate went on earning the
 * full commission on a partly refunded order however much was returned — and
 * recomputing it changed nothing, because the total itself never moves.
 */
function commissionBase(total, shipping, refunded) {
  return Math.max(0, Number(total || 0) - Number(shipping || 0) - Number(refunded || 0));
}

/**
 * The commission columns for one order.
 *
 * Returns zeroes rather than leaving the fields alone when there is no
 * affiliate: an order that carries a commission figure and no affiliate to pay
 * it to is exactly the shape a tampered checkout body produces, and "leave what
 * was sent" is what made that worth doing.
 *
 * @param {object} order the order row (needs total_usd/total_crc and shipping)
 * @param {object|null} affiliate the affiliates row, or null when unattributed
 * @returns {{affiliate_commission_usd: number, affiliate_commission_crc: number}}
 */
export function affiliateCommissionPatch(order, affiliate) {
  if (!order?.affiliate_id || !affiliate) {
    return {
      affiliate_commission_usd: 0,
      affiliate_commission_crc: 0,
    };
  }

  // Stored as a fraction (0.10 = 10%), per the affiliates table default.
  const rate = Number(affiliate.commission_rate || 0);
  const usdBase = commissionBase(order.total_usd, order.shipping_cost_usd, order.refunded_amount_usd);
  const crcBase = commissionBase(order.total_crc, order.shipping_cost_crc, order.refunded_amount_crc);

  return {
    affiliate_commission_usd: Number((usdBase * rate).toFixed(2)),
    affiliate_commission_crc: Math.round(crcBase * rate),
  };
}

const norm = (value) => String(value ?? '').trim().toLowerCase();

export function affiliateHandlingAgentName(affiliate, profiles = []) {
  const handlerId = affiliate?.handling_agent_id || affiliate?.main_agent_id || affiliate?.parent_agent_id;
  if (!handlerId) return null;

  const profile = (profiles || []).find((row) => row?.user_id === handlerId);
  if (!profile) return null;
  if (norm(profile.tier) === 'sub_user') return null;
  if (['pending', 'suspended'].includes(norm(profile.status))) return null;

  return String(profile.name || profile.email || '').trim() || null;
}

/**
 * The partner a referral link's name belongs to, or null.
 *
 * A partner's link carries their name in sales_agent, exactly like a sales
 * rep's. The rep path only resolves names belonging to STAFF profiles, so an
 * order from a partner with a dashboard and no discount code landed with
 * affiliate_id null — earning them nothing and never appearing in their own My
 * Orders, while their dashboard promised orders through the link are credited
 * automatically.
 *
 * Deliberately narrow. Only an affiliate whose login is tier 'affiliate' and
 * active matches: that is exactly the partners given a dashboard. Affiliates
 * with no login, staff and sub-users are all left to the paths that already
 * handle them, so no existing order changes hands.
 */
export function partnerReferralAffiliate(affiliates = [], profiles = [], agentName = '') {
  const wanted = norm(agentName);
  if (!wanted) return null;

  const match = (affiliates || []).find(
    (row) => row?.admin_profile_user_id && norm(row.name) === wanted
  );
  if (!match) return null;

  const login = (profiles || []).find((row) => row?.user_id === match.admin_profile_user_id);
  if (norm(login?.tier) !== 'affiliate') return null;
  if (norm(login?.status) !== 'active') return null;

  return match;
}
