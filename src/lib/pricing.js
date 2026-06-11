// Authoritative, server-side pricing logic.
//
// These helpers MUST mirror the catalog checkout math exactly so that a
// bot-generated checkout link charges the same total a human would see on the
// website. Prices are ALWAYS resolved from the database here — never trusted
// from the caller — which is the core security guarantee of the bot endpoint.
//
// Reference implementation: src/app/catalog/page.js
//   - parsePrice / getPriceAsNumber
//   - getVolumeDiscountPct (5+ vials = 15%, 10+ = 20%)
//   - getShippingFee (free over $200 USD-equivalent, else ₡2500 / USD equiv)

export const FALLBACK_EXCHANGE_RATE = 454.48; // USD -> CRC, matches catalog fallback
export const FREE_SHIPPING_USD_THRESHOLD = 200;
export const FLAT_SHIPPING_CRC = 2500;

/** Strip currency symbols / separators from a DB price string -> Number. */
export function parsePrice(priceStr) {
  if (priceStr === null || priceStr === undefined) return 0;
  const clean = String(priceStr).replace(/[^0-9.]/g, '');
  const val = parseFloat(clean);
  return Number.isFinite(val) ? val : 0;
}

/** Unit price for a product row in the requested currency. */
export function getUnitPrice(product, currency, exchangeRate = FALLBACK_EXCHANGE_RATE) {
  if (currency === 'USD') {
    return parsePrice(product.price_usd);
  }
  if (product.price_crc) {
    return parsePrice(product.price_crc);
  }
  return Math.round(parsePrice(product.price_usd) * exchangeRate);
}

/** Volume discount percentage based on total vial (unit) count. */
export function getVolumeDiscountPct(vialCount) {
  if (vialCount >= 10) return 20;
  if (vialCount >= 5) return 15;
  return 0;
}

/**
 * Compute authoritative order totals.
 *
 * @param {Array<{ unitPrice: number, qty: number }>} lineItems
 * @param {'USD'|'CRC'} currency
 * @param {number} exchangeRate
 * @returns {{ subtotal, discountPct, discountAmount, discountedTotal, shipping, total, vialCount }}
 */
export function computeOrderTotals(lineItems, currency, exchangeRate = FALLBACK_EXCHANGE_RATE) {
  const subtotal = lineItems.reduce((acc, li) => acc + li.unitPrice * li.qty, 0);
  const vialCount = lineItems.reduce((acc, li) => acc + li.qty, 0);

  const discountPct = getVolumeDiscountPct(vialCount);
  const discountedTotal = discountPct > 0
    ? Math.round(subtotal * (1 - discountPct / 100))
    : subtotal;
  const discountAmount = subtotal - discountedTotal;

  const discountedUsd = currency === 'USD' ? discountedTotal : discountedTotal / exchangeRate;
  let shipping = 0;
  if (discountedUsd < FREE_SHIPPING_USD_THRESHOLD) {
    shipping = currency === 'CRC'
      ? FLAT_SHIPPING_CRC
      : parseFloat((FLAT_SHIPPING_CRC / exchangeRate).toFixed(2));
  }

  const total = discountedTotal + shipping;

  return { subtotal, discountPct, discountAmount, discountedTotal, shipping, total, vialCount };
}

/**
 * Fetch the live USD->CRC rate (same source the catalog uses), falling back to
 * the constant on any failure. Best-effort; never throws.
 */
export async function getUsdToCrcRate() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      // Don't let a slow FX provider hang the checkout-link request.
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const rate = data?.rates?.CRC;
      if (typeof rate === 'number' && rate > 0) return rate;
    }
  } catch {
    // swallow — fall through to fallback
  }
  return FALLBACK_EXCHANGE_RATE;
}
