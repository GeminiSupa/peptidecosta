// Authoritative, server-side pricing logic.
//
// These helpers MUST mirror the catalog checkout math exactly so that a
// bot-generated checkout link charges the same total a human would see on the
// website. Prices are ALWAYS resolved from the database here — never trusted
// from the caller — which is the core security guarantee of the bot endpoint.
//
// Reference implementation: src/app/catalog/page.js
//   - parsePrice / getPriceAsNumber
//   - getVolumeDiscountPct (5+ vials = 15%, 10+ = 20%; BAC water excluded)
//   - getShippingFee (free over $200 USD-equivalent, else ₡2500 / USD equiv)
//   - BAC water pricing (src/lib/bacWater.mjs)

// Relative, not the `@/` alias: the alias only resolves inside the Next
// bundler, and this module is the authority on what the cart charges, so the
// unit tests have to be able to import it directly.
import { isBacWater, summarizeBacWater, applyBacAwareDiscount } from './bacWater.mjs';

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

export function formatCrcPrice(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `₡${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatCrcPriceFromUsd(priceUsd, exchangeRate = FALLBACK_EXCHANGE_RATE) {
  const usd = parsePrice(priceUsd);
  if (!usd) return '';
  return formatCrcPrice(usd * exchangeRate);
}

/** Unit price for a product row in the requested currency. */
export function getUnitPrice(product, currency, exchangeRate = FALLBACK_EXCHANGE_RATE) {
  if (currency === 'USD') {
    return parsePrice(product.price_usd);
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
 * BAC water is priced by its own rules (see src/lib/bacWater.mjs): a free vial
 * per peptide, a flat charge beyond that, no part in the volume discount. Pass
 * `product` on each line so those lines can be told apart — a line without a
 * name is treated as ordinary merchandise.
 *
 * @param {Array<{ unitPrice: number, qty: number, product?: string }>} lineItems
 * @param {'USD'|'CRC'} currency
 * @param {number} exchangeRate
 * @returns {{ subtotal, discountPct, discountAmount, discountedTotal, shipping, total, vialCount, bacCharge }}
 */
export function computeOrderTotals(lineItems, currency, exchangeRate = FALLBACK_EXCHANGE_RATE, options = {}) {
  const merchandise = lineItems.filter((li) => !isBacWater(li.product));
  const discountableSubtotal = merchandise.reduce((acc, li) => acc + li.unitPrice * li.qty, 0);
  // BAC water never moves the customer up a discount tier.
  const vialCount = merchandise.reduce((acc, li) => acc + li.qty, 0);

  const bac = summarizeBacWater(
    lineItems.map((li) => ({ product: li.product, qty: li.qty, unitPrice: li.unitPrice })),
    currency,
    exchangeRate,
  );

  const configuredPct = Number(options.volumeDiscountPct);
  const discountPct = Number.isFinite(configuredPct)
    ? Math.max(0, configuredPct)
    : getVolumeDiscountPct(vialCount);
  const {
    subtotal,
    discountAmount,
    itemsTotal: discountedTotal,
  } = applyBacAwareDiscount(discountableSubtotal, bac.charge, discountPct);

  const discountedUsd = currency === 'USD' ? discountedTotal : discountedTotal / exchangeRate;
  let shipping = 0;
  if (discountedUsd < FREE_SHIPPING_USD_THRESHOLD) {
    shipping = currency === 'CRC'
      ? FLAT_SHIPPING_CRC
      : parseFloat((FLAT_SHIPPING_CRC / exchangeRate).toFixed(2));
  }

  const total = discountedTotal + shipping;

  return { subtotal, discountPct, discountAmount, discountedTotal, shipping, total, vialCount, bacCharge: bac.charge };
}

// Outer fence for USD -> CRC. Deliberately wide: it only catches garbage — a
// decimal shift, a zeroed field, another currency's number — because pinning it
// close to today's rate would break pricing outright if the colón ever moved to
// a genuinely new level. The deviation check below does the precise work.
export const MIN_PLAUSIBLE_RATE = 300;
export const MAX_PLAUSIBLE_RATE = 800;

// How far a new quote may move from the last known-good rate before we stop
// taking one provider's word for it. The colón is managed and holds a narrow
// range for months — 69 days of our own order history sit between 448 and 456 —
// so a jump beyond this is far more often a broken feed than a market move. On
// 22 Aug 2026 a feed quoted 484.50 against a prior 450.45 (+7.6%); it went
// straight onto the storefront and overcharged colón buyers ~7% for five hours.
export const MAX_RATE_DEVIATION_PCT = 5;

// Two providers count as agreeing within this much of each other.
export const PROVIDER_AGREEMENT_PCT = 2;

export function isPlausibleRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= MIN_PLAUSIBLE_RATE && rate <= MAX_PLAUSIBLE_RATE;
}

function pctDiff(a, b) {
  return Math.abs((a - b) / b) * 100;
}

// Tried in order; the first plausible answer wins, so losing any one provider
// costs us nothing. CurrencyFreaks is primary but needs a key, and is skipped
// when unconfigured. The other two are keyless on purpose: if the paid account
// lapses or its key is rotated badly, the storefront still prices correctly.
export const RATE_PROVIDERS = [
  {
    name: 'currencyfreaks',
    url: () => (process.env.CURRENCYFREAKS_API_KEY
      ? `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${process.env.CURRENCYFREAKS_API_KEY}&symbols=CRC`
      : null),
    // CurrencyFreaks quotes rates as strings ("443.93"); isPlausibleRate coerces.
    pick: (data) => data?.rates?.CRC,
  },
  {
    name: 'open.er-api.com',
    url: () => 'https://open.er-api.com/v6/latest/USD',
    pick: (data) => data?.rates?.CRC,
  },
  {
    name: 'currency-api',
    url: () => 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    pick: (data) => data?.usd?.crc,
  },
];

async function readProviderQuote(provider) {
  let url = null;
  try {
    url = provider.url();
  } catch {
    return null;
  }
  if (!url) return null;

  try {
    const res = await fetch(url, {
      // Don't let a slow FX provider hang server-side checkout work.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;

    const quoted = provider.pick(await res.json());
    if (!isPlausibleRate(quoted)) {
      return { rate: null, source: provider.name, quoted };
    }
    return { rate: Number(quoted), source: provider.name, quoted };
  } catch {
    // unreachable or malformed
    return null;
  }
}

/**
 * Fetch the live USD->CRC rate. Providers are tried in order and the first
 * plausible answer wins, so the happy path costs a single request. A quote that
 * moves more than MAX_RATE_DEVIATION_PCT from `previousRate` is not trusted on
 * its own — a second provider has to independently agree before it may reprice
 * the storefront. Returns { rate, source }, or null when nothing is usable, in
 * which case the caller keeps whatever it already had. Never throws.
 *
 * @param {{ previousRate?: number|null }} [options] last known-good rate
 */
export async function fetchLiveUsdToCrcRate({ previousRate = null } = {}) {
  const quotes = [];
  const refused = [];

  for (const provider of RATE_PROVIDERS) {
    const quote = await readProviderQuote(provider);
    if (!quote) continue;
    if (quote.rate === null) {
      refused.push(`${quote.source}=${quote.quoted}`);
      continue;
    }
    quotes.push(quote);

    const anchored = isPlausibleRate(previousRate);
    if (!anchored || pctDiff(quote.rate, previousRate) <= MAX_RATE_DEVIATION_PCT) {
      return { rate: quote.rate, source: quote.source };
    }

    // Big move. Look for a second, independent provider that agrees before
    // letting it through; a real devaluation shows up everywhere at once.
    // `quotes` is in provider-priority order, so any match is the higher-ranked
    // of the pair and its number is the one we publish.
    const agrees = quotes.find(
      (other) => other !== quote && pctDiff(other.rate, quote.rate) <= PROVIDER_AGREEMENT_PCT,
    );
    if (agrees) {
      return { rate: agrees.rate, source: `${agrees.source}+${quote.source}` };
    }
  }

  if (refused.length) {
    console.warn(`[exchange-rate] quotes outside the plausible band refused: ${refused.join(', ')}`);
  }
  if (quotes.length) {
    console.warn(
      `[exchange-rate] no provider corroborated a >${MAX_RATE_DEVIATION_PCT}% move from ${previousRate}; `
      + `keeping the previous rate. Quotes seen: ${quotes.map((q) => `${q.source}=${q.rate}`).join(', ')}`,
    );
  }
  return null;
}

export async function getUsdToCrcRate(options) {
  const live = await fetchLiveUsdToCrcRate(options);
  return live ? live.rate : FALLBACK_EXCHANGE_RATE;
}
