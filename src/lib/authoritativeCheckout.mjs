/**
 * Rebuild a public checkout from database product rows.
 *
 * The browser is a display surface, not a price authority. This module replaces
 * every posted unit price and total with current catalog values, then reports
 * whether the shopper must review a changed price before the order is saved.
 */

import {
  buildBacAwareOrderItems,
  checkBacOnlyMinimum,
  isBacWater,
  isGiftLine,
  isSellableBacWater,
  stripGiftSuffix,
} from './bacWater.mjs';
import { effectiveVolumeDiscountPct } from './promoEligibility.mjs';
import { computeOrderTotals, getUnitPrice, getVolumeDiscountPct } from './pricing.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundCurrency = (value, currency) => currency === 'USD' ? round2(value) : Math.round(Number(value || 0));
const normalize = (value) => String(value || '').trim().toLowerCase();

function qtyOf(item) {
  const qty = Number.parseInt(item?.qty ?? item?.quantity ?? 0, 10);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function promoDiscountAmount(cart, totals, promo, currency) {
  if (!promo) return 0;
  const pct = Math.min(1, Math.max(0, Number(promo.discount_pct || 0)));
  if (!Number.isFinite(pct) || pct <= 0) return 0;

  let base = totals.discountableSubtotal;
  if (promo.is_flash_sale && promo.target_product) {
    const targets = String(promo.target_product)
      .split(',')
      .map(normalize)
      .filter(Boolean);
    base = cart
      .filter((item) => !isBacWater(item.product) && targets.some((target) => normalize(item.product).includes(target)))
      .reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
  }
  if (totals.discountPct > 0) base *= (1 - totals.discountPct / 100);
  return roundCurrency(base * pct, currency);
}

export function authoritativeCheckout({
  postedOrder,
  products,
  promo = null,
  exchangeRate,
  // Set only by the admin order routes, for a manual order carrying a
  // negotiated discount: that discount replaces the volume tier rather than
  // stacking on top of it. Never set from the public checkout.
  suppressVolumeDiscount = false,
}) {
  const currency = postedOrder?.currency === 'USD' ? 'USD' : 'CRC';
  const productByName = new Map((products || []).map((product) => [normalize(product.product), product]));
  const requestedByName = new Map();
  const missing = [];

  for (const item of postedOrder?.items || []) {
    if (isGiftLine(item)) continue;
    const productName = stripGiftSuffix(item?.product || item?.name);
    const qty = qtyOf(item);
    if (!productName || qty <= 0) continue;
    const product = productByName.get(normalize(productName));
    if (!product) {
      missing.push(productName);
      continue;
    }
    const key = normalize(product.product);
    const existing = requestedByName.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      requestedByName.set(key, {
        product: product.product,
        qty,
        unitPrice: getUnitPrice(product, currency, exchangeRate),
        priceUsd: product.price_usd,
        priceCrc: product.price_crc,
        status: product.status,
        inventoryCount: product.inventory_count,
      });
    }
  }

  const requested = [...requestedByName.values()];

  if (missing.length > 0) {
    return { ok: false, error: `These products are no longer available: ${[...new Set(missing)].join(', ')}` };
  }
  if (requested.length === 0) return { ok: false, error: 'The order has no purchasable items.' };

  const retiredWater = requested.filter((item) => isBacWater(item.product) && !isSellableBacWater(item.product));
  if (retiredWater.length > 0) {
    return { ok: false, error: `These products are no longer sold: ${retiredWater.map((item) => item.product).join(', ')}` };
  }

  // A null inventory_count means this product is not quantity-tracked. Most
  // legacy catalog rows use that shape and rely on the explicit In Stock / Out
  // of Stock status. Number(null) is 0, so treating the nullable column as a
  // number rejected every untracked product as sold out.
  const unavailable = requested.filter((item) => (
    item.status !== 'In Stock'
    || (item.inventoryCount !== null && Number(item.inventoryCount) <= 0)
  ));
  if (unavailable.length > 0) {
    return { ok: false, error: `These products are out of stock: ${unavailable.map((item) => item.product).join(', ')}` };
  }
  const overStock = requested.filter((item) => (
    item.inventoryCount !== null && item.qty > Number(item.inventoryCount)
  ));
  if (overStock.length > 0) {
    return {
      ok: false,
      error: overStock.map((item) => `${item.product}: only ${item.inventoryCount} available`).join('; '),
    };
  }

  const bacMinimum = checkBacOnlyMinimum(requested);
  if (bacMinimum.blocked) {
    return {
      ok: false,
      error: `Water-only orders require at least ${bacMinimum.minUnits} vials; add ${bacMinimum.shortfall} more.`,
    };
  }

  if (promo?.is_flash_sale && promo?.target_product) {
    const targets = String(promo.target_product).split(',').map(normalize).filter(Boolean);
    const hasTarget = requested.some((item) => (
      !isBacWater(item.product) && targets.some((target) => normalize(item.product).includes(target))
    ));
    if (!hasTarget) {
      return { ok: false, error: `This promo requires ${promo.target_product} in the cart.` };
    }
  }

  const vialCount = requested.filter((item) => !isBacWater(item.product)).reduce((sum, item) => sum + item.qty, 0);
  const volumeDiscountPct = suppressVolumeDiscount
    ? 0
    : effectiveVolumeDiscountPct(promo, getVolumeDiscountPct(vialCount));
  const totals = computeOrderTotals(requested, currency, exchangeRate, { volumeDiscountPct });
  const promoDiscount = promoDiscountAmount(requested, totals, promo, currency);
  const finalTotal = roundCurrency(totals.discountedTotal - promoDiscount + totals.shipping, currency);

  const canonicalItems = buildBacAwareOrderItems(requested, {
    currency,
    exchangeRate,
    priceOf: (item) => item.unitPrice,
    lang: postedOrder?.lang || 'es',
  });
  const postedTotal = currency === 'USD'
    ? Number(postedOrder?.total_usd || 0)
    : Number(postedOrder?.total_crc || 0);
  const tolerance = currency === 'USD' ? 0.009 : 0;

  return {
    ok: true,
    changed: Math.abs(postedTotal - finalTotal) > tolerance,
    currency,
    products: requested.map((item) => ({
      product: item.product,
      priceUsd: item.priceUsd,
      priceCrc: item.priceCrc,
      status: item.status,
      inventoryCount: item.inventoryCount,
    })),
    items: canonicalItems,
    subtotal: totals.subtotal,
    volumeDiscountPct,
    volumeDiscountAmount: totals.discountAmount,
    promoDiscount,
    shipping: totals.shipping,
    total: finalTotal,
    totalUsd: currency === 'USD' ? finalTotal : round2(finalTotal / exchangeRate),
    totalCrc: currency === 'CRC' ? finalTotal : Math.round(finalTotal * exchangeRate),
  };
}

export function activeDealForOrder(deals, items, now = new Date()) {
  const names = new Set((items || []).map((item) => normalize(stripGiftSuffix(item?.product || item?.name))));
  const instant = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return (deals || []).find((deal) => (
    deal?.status === 'live'
    && (!deal.starts_at || instant >= Date.parse(deal.starts_at))
    && (!deal.ends_at || instant <= Date.parse(deal.ends_at))
    && (deal.product_names || []).some((name) => names.has(normalize(name)))
  )) || null;
}
