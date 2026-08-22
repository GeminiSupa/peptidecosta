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
