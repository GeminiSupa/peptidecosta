/**
 * Deal of the Week — one promotion per week, ending Sunday midnight Costa Rica.
 *
 * A deal is an automatic promotion, not a promo code. Shelf deals mark the
 * selected products down immediately. Bulk-threshold deals leave shelf prices
 * alone and apply at checkout after the selected-unit minimum is reached.
 * Neither mode may combine with volume pricing or promo codes.
 *
 * Everything here is pure so the money math and the week boundary are testable
 * without a database. The caller supplies `now` and the exchange rate; nothing
 * in this file reads the clock or the network on its own.
 */

import { crWallToIso, formatCrInstant, CR_UTC_OFFSET_HOURS } from './crTime.mjs';
import { dealFieldsMatch } from './dealProductProtection.mjs';
import { OFFERS_PRICING_MODE, dealOfferSummaries } from './dealOffers.mjs';

const CR_OFFSET_MS = CR_UTC_OFFSET_HOURS * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** A scheduled start must be at least this far ahead, so it is not already due on save. */
const SCHEDULE_MIN_LEAD_MS = 60 * 1000;

/** Free-text label written into products.discount while a deal is live. */
export const DEAL_DISCOUNT_LABEL = 'Deal of the Week';
export const DEAL_CATALOG_URL = 'https://catalog.peptidescostarica.net/catalog';
export const DEAL_REVIEW_THRESHOLD_PCT = 30;
export const DEAL_HARD_LIMIT_PCT = 50;
export const DEAL_MAX_STACKED_DISCOUNT_PCT = 55;

/**
 * Costa Rica wall-clock parts for an instant.
 *
 * Shifting the instant back by the fixed CR offset makes the UTC getters read
 * out CR wall time — the same trick crTime.mjs uses, and safe because Costa
 * Rica has no DST.
 */
function crWallParts(instant) {
  const shifted = new Date(instant.getTime() - CR_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(), // 0 = Sunday
    shifted,
  };
}

function wallDateString(shifted) {
  return shifted.toISOString().slice(0, 10);
}

/**
 * The window for a deal launched at `now`: starts immediately, ends at the last
 * moment of the coming Sunday in Costa Rica.
 *
 * "Sunday at midnight" is read as the END of Sunday (23:59:59.999), so the deal
 * covers the whole of Sunday rather than dying as Sunday begins.
 *
 * If that boundary is less than `minHours` away the following Sunday is used
 * instead. Launching on a Sunday evening would otherwise produce a "Deal of the
 * Week" with a few hours left in it — long enough to mark every price down and
 * send the announcement, not long enough for anyone to act on it. The resolved
 * date is always shown back to the admin before launch, so this rolls the
 * window forward without deciding anything behind their back.
 *
 * @returns {{ startsAt: string, endsAt: string, endsAtDate: string, rolledForward: boolean }}
 */
export function weekWindow(now = new Date(), { minHours = 24 } = {}) {
  const instant = now instanceof Date ? now : new Date(now);
  const { dayOfWeek, shifted } = crWallParts(instant);

  // Sunday is 0, so a non-Sunday is (7 - dayOfWeek) days from the coming one.
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  const sunday = new Date(shifted.getTime());
  sunday.setUTCDate(sunday.getUTCDate() + daysUntilSunday);

  let endsAt = crWallToIso(`${wallDateString(sunday)}T23:59:59.999`);
  let rolledForward = false;

  if (Date.parse(endsAt) - instant.getTime() < minHours * HOUR_MS) {
    sunday.setUTCDate(sunday.getUTCDate() + 7);
    endsAt = crWallToIso(`${wallDateString(sunday)}T23:59:59.999`);
    rolledForward = true;
  }

  return {
    startsAt: instant.toISOString(),
    endsAt,
    endsAtDate: wallDateString(sunday),
    rolledForward,
  };
}

/**
 * The window for a deal scheduled to start later: it begins at `startsAt` and
 * ends at the Sunday that follows it, by the same rule as weekWindow.
 *
 * A start that overlaps the live deal is refused rather than silently cutting
 * the live deal short — only one deal can run, and ending one early is a
 * decision for the End button, not a side effect of scheduling.
 *
 * @returns {{ window?: ReturnType<typeof weekWindow>, error?: string }}
 */
export function scheduledWindow(startsAt, { now = new Date(), liveEndsAt = null } = {}) {
  const start = Date.parse(startsAt || '');
  if (!Number.isFinite(start)) return { error: 'Pick a start date and time.' };
  const instant = now instanceof Date ? now.getTime() : Date.parse(now);
  if (start <= instant + SCHEDULE_MIN_LEAD_MS) {
    return { error: 'That start time has already passed. Pick a later time, or launch the deal now.' };
  }
  if (liveEndsAt && start < Date.parse(liveEndsAt)) {
    return { error: `The current deal runs until ${formatCrInstant(liveEndsAt)}. Pick a start at or after that time.` };
  }
  return { window: weekWindow(new Date(start)) };
}

/** Strip currency symbols and separators from a stored price string. */
export function parsePriceNumber(value) {
  if (value === null || value === undefined) return 0;
  const parsed = parseFloat(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Format a USD amount the way the price columns already hold it: "$125" for a
 * whole number, "$106.25" once the markdown produces cents.
 */
export function formatUsdPrice(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

/** Matches formatCrcPrice in src/lib/pricing.js: "₡56,810". */
export function formatCrcPrice(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `₡${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * The marked-down USD figure, rounded to cents.
 *
 * Rounded here rather than left as a float so the stored string, the catalog
 * card and the order total all read from one already-rounded number instead of
 * each rounding a slightly different way.
 */
export function markdownUsd(baseUsd, discountPct) {
  const base = parsePriceNumber(baseUsd);
  const pct = Number(discountPct);
  if (!base || !Number.isFinite(pct) || pct <= 0 || pct >= 1) return base;
  return Math.round(base * (1 - pct) * 100) / 100;
}

/** Whole-number percentage for display: 0.15 -> 15. */
export function toPercent(discountPct) {
  const value = Number(discountPct || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value <= 1 ? value * 100 : value);
}

/** Legacy display helper retained for old deal-history tests and records. */
export function stackedDiscountPercent(discountPct, volumePct = 0) {
  const deal = Math.min(1, Math.max(0, Number(discountPct) || 0));
  const volume = Math.min(1, Math.max(0, (Number(volumePct) || 0) / 100));
  return Math.round((1 - ((1 - deal) * (1 - volume))) * 10000) / 100;
}

/**
 * Stock rules for a deal, kept in one place because the panel warns on them and
 * the launch refuses on them, and the two copies had already drifted apart.
 *
 * An inventory count of null means nobody counts that product's units, which is
 * true of most of the catalog. Untracked is NOT out of stock — it is the case
 * the manual-confirmation checkbox exists for — so a null count must never be
 * read as a zero count. Both spellings are accepted: the database row is
 * snake_case, the admin panel's row is camelCase.
 */
function stockCount(product) {
  const raw = product?.inventoryCount !== undefined ? product.inventoryCount : product?.inventory_count;
  return raw === undefined ? null : raw;
}

/** No count is kept, so the count says nothing about availability either way. */
export function hasUntrackedStock(product) {
  return stockCount(product) === null;
}

/** Genuinely unavailable: marked out of stock, or counted down to zero. */
export function isUnavailableForDeal(product) {
  if (product?.status !== 'In Stock') return true;
  const count = stockCount(product);
  return count !== null && Number(count) <= 0;
}

/**
 * One shared guard for the preview and launch paths. A high markdown is allowed
 * only after an explicit review, while a commercially dangerous combined
 * markdown is refused outright.
 */
export function dealSafety(discountPct, { confirmedHighDiscount = false } = {}) {
  const pct = toPercent(discountPct);
  const stackedAtFive = pct;
  const stackedAtTen = pct;

  if (pct <= 0 || pct >= 100) {
    return { ok: false, error: 'The discount must be between 1% and 99%.', pct, stackedAtFive, stackedAtTen };
  }
  if (pct > DEAL_HARD_LIMIT_PCT) {
    return { ok: false, error: `A weekly deal cannot exceed ${DEAL_HARD_LIMIT_PCT}% off.`, pct, stackedAtFive, stackedAtTen };
  }
  if (pct >= DEAL_REVIEW_THRESHOLD_PCT && !confirmedHighDiscount) {
    return {
      ok: false,
      needsConfirmation: true,
      error: `Review required for a ${pct}% weekly discount. No other discounts will stack with it.`,
      pct,
      stackedAtFive,
      stackedAtTen,
    };
  }
  return { ok: true, pct, stackedAtFive, stackedAtTen };
}

/** A deal-specific catalog destination that survives channel handoffs and attributes orders. */
export function dealCatalogUrl(deal, baseUrl = DEAL_CATALOG_URL) {
  const url = new URL(baseUrl);
  if (deal?.id) url.searchParams.set('deal_id', String(deal.id));
  url.searchParams.set('utm_source', 'weekly_deal');
  url.searchParams.set('utm_medium', 'broadcast');
  url.searchParams.set('utm_campaign', deal?.id ? `deal_${deal.id}` : 'weekly_deal');
  const firstProduct = (deal?.product_names || []).find(Boolean);
  if (firstProduct) url.searchParams.set('product', firstProduct);
  return url.toString();
}

/**
 * Everything about a product row that a launch overwrites, so it can be put
 * back exactly. `discount` is in here because that column doubles as the
 * free-text "Volume/Bulk Discount Info" in the Products tab and as the on/off
 * gate the catalog reads for a sale window — a launch has to overwrite it, and
 * losing the bulk-pricing wording would be a silent edit to the product.
 */
export function snapshotBaseline(product) {
  return {
    product: product.product,
    price_usd: product.price_usd ?? null,
    price_crc: product.price_crc ?? null,
    original_price_usd: product.original_price_usd ?? null,
    original_price_crc: product.original_price_crc ?? null,
    discount: product.discount ?? null,
    sale_start_time: product.sale_start_time ?? null,
    sale_end_time: product.sale_end_time ?? null,
  };
}

/**
 * The column values that put a product on deal.
 *
 * The markdown is always computed from `baseline`, never from the row's current
 * price. Relaunching over a live deal therefore re-derives 15% off the true
 * shelf price instead of taking another 15% off an already-reduced one, which
 * would quietly become 28%.
 *
 * original_price_* carries the pre-deal price so the catalog can strike it
 * through, which is also what makes the existing ribbon render "SAVE 15%"
 * without any new badge code.
 */
export function buildMarkdown(baseline, discountPct, window, exchangeRate) {
  const baseUsd = parsePriceNumber(baseline.price_usd);
  const salePriceUsd = markdownUsd(baseUsd, discountPct);

  return {
    price_usd: formatUsdPrice(salePriceUsd),
    price_crc: formatCrcPrice(salePriceUsd * exchangeRate),
    original_price_usd: formatUsdPrice(baseUsd),
    original_price_crc: formatCrcPrice(baseUsd * exchangeRate),
    discount: `${toPercent(discountPct)}% ${DEAL_DISCOUNT_LABEL}`,
    sale_start_time: window.startsAt,
    sale_end_time: window.endsAt,
  };
}

/**
 * The column values that take a product back off deal.
 *
 * This is not cosmetic. Once sale_end_time passes, the catalog stops rendering
 * the ribbon and stops striking through the old price, but it never restores
 * price_usd — so an unrestored product keeps selling at the deal price
 * indefinitely, with nothing on the page to show it. Expiry MUST replay this.
 */
export function restorePayload(baseline) {
  return {
    price_usd: baseline.price_usd,
    price_crc: baseline.price_crc,
    original_price_usd: baseline.original_price_usd,
    original_price_crc: baseline.original_price_crc,
    discount: baseline.discount,
    sale_start_time: baseline.sale_start_time,
    sale_end_time: baseline.sale_end_time,
  };
}


/**
 * A price can be restored only while it still equals what this deal wrote.
 * This prevents expiry from erasing a deliberate Products-tab edit made while
 * the promotion was live. Legacy deals without an applied snapshot keep their
 * old restore behaviour so an already-running promotion can still end.
 */
export function canSafelyRestoreProduct(current, applied) {
  if (!applied || Object.keys(applied).length === 0) return true;
  return dealFieldsMatch(current, applied);
}

/**
 * Older live deals have a baseline but no record of every value launch wrote.
 * Their USD price and sale metadata are still deterministic, so compare that
 * fingerprint before restoring. CRC is deliberately omitted because the
 * exchange rate used at launch was not stored on those rows.
 */
export function canSafelyRestoreLegacyProduct(current, baseline, deal) {
  const expected = {
    price_usd: formatUsdPrice(markdownUsd(baseline?.price_usd, deal?.discount_pct)),
    original_price_usd: formatUsdPrice(parsePriceNumber(baseline?.price_usd)),
    discount: `${toPercent(deal?.discount_pct)}% ${DEAL_DISCOUNT_LABEL}`,
    sale_start_time: deal?.starts_at ?? null,
    sale_end_time: deal?.ends_at ?? null,
  };
  // Through the same comparison as the snapshot path: these two timestamps come
  // straight off the deal row, so they carry Postgres's +00:00 while the
  // product's own columns may not.
  return dealFieldsMatch(current, expected, Object.keys(expected));
}

/** A deal counts as live only while it is inside its own window. */
export function isDealLive(deal, now = new Date()) {
  if (!deal || deal.status !== 'live') return false;
  const instant = (now instanceof Date ? now : new Date(now)).getTime();
  if (deal.starts_at && instant < Date.parse(deal.starts_at)) return false;
  if (deal.ends_at && instant > Date.parse(deal.ends_at)) return false;
  return true;
}

/** Product names as a readable list: "GHK-Cu", "A and B", "A, B and C". */
function joinNames(names, conjunction) {
  const list = (names || []).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} ${conjunction} ${list[list.length - 1]}`;
}

export function dealPricingMode(deal) {
  if (deal?.pricing_mode === OFFERS_PRICING_MODE) return OFFERS_PRICING_MODE;
  return deal?.pricing_mode === 'bulk_threshold' ? 'bulk_threshold' : 'shelf';
}

export function dealMinUnits(deal) {
  return dealPricingMode(deal) === 'bulk_threshold' ? Math.max(1, Math.floor(Number(deal?.min_units || 1))) : 0;
}

export function dealMaxUnits(deal) {
  const value = Math.floor(Number(deal?.max_units || 0));
  return value > 0 ? value : null;
}

export function dealEligibleUnits(deal, items = []) {
  const names = new Set((deal?.product_names || []).map((name) => String(name).trim().toLowerCase()));
  return (items || []).reduce((sum, item) => names.has(String(item?.product || item?.name || '').trim().toLowerCase())
    ? sum + Math.max(0, Math.floor(Number(item?.qty || item?.quantity || 0))) : sum, 0);
}

export function automaticDealPromo(deal, items = []) {
  if (!deal || dealPricingMode(deal) !== 'bulk_threshold') return null;
  const units = dealEligibleUnits(deal, items);
  const min = dealMinUnits(deal);
  const max = dealMaxUnits(deal);
  if (units < min || (max && units > max)) return null;
  return {
    discount_pct: Number(deal.discount_pct),
    min_units: min,
    max_units: max,
    is_flash_sale: true,
    exact_target_match: true,
    target_product: (deal.product_names || []).join(', '),
  };
}

/**
 * Banner ticker copy. The banner is one line scrolling across every page, so it
 * names the product and the saving and nothing else — there is no room for
 * terms, and the catalog card already shows the struck-through price.
 */
export function dealBannerText(deal, lang = 'en') {
  const pct = toPercent(deal?.discount_pct);
  if (!pct) return '';
  const isEn = String(lang).toLowerCase().startsWith('en');
  if (dealPricingMode(deal) === OFFERS_PRICING_MODE) {
    const custom = String((isEn ? deal?.title_en : deal?.title_es) || '').trim();
    if (custom) return custom;
    const offers = dealOfferSummaries(deal?.offers, lang).join(isEn ? ' — or — ' : ' — o — ');
    return isEn
      ? `⚡ DEAL OF THE WEEK: ${offers}. No code needed; offers do not stack.`
      : `⚡ OFERTA DE LA SEMANA: ${offers}. Sin código; las ofertas no se acumulan.`;
  }
  const names = deal?.product_names || [];
  const bulk = dealPricingMode(deal) === 'bulk_threshold';
  const minimum = dealMinUnits(deal);

  if (isEn) {
    const custom = String(deal?.title_en || '').trim();
    if (custom) return custom;
    return bulk
      ? `⚡ DEAL OF THE WEEK: ${pct}% off when you mix and match ${minimum}+ selected vials. No code needed. Stock is limited.`
      : `⚡ DEAL OF THE WEEK: ${pct}% off ${joinNames(names, 'and')}. No code needed; discounts do not stack. Ends Sunday.`;
  }

  const customEs = String(deal?.title_es || '').trim();
  if (customEs) return customEs;
  return bulk
    ? `⚡ OFERTA DE LA SEMANA: ${pct}% de descuento al combinar ${minimum}+ viales seleccionados. Sin código. Inventario limitado.`
    : `⚡ OFERTA DE LA SEMANA: ${pct}% de descuento en ${joinNames(names, 'y')}. Sin código; los descuentos no se acumulan. Termina el domingo.`;
}

/**
 * Announcement copy for a launch: a subject line, and one message body.
 *
 * One body rather than separate email and WhatsApp versions because the
 * Announcements panel sends a single `message` down both channels — a second
 * variant would look complete here and then never reach anybody. It is written
 * bilingually for the same reason the storefront is.
 *
 * These are drafts only; nothing is sent from here. The launch endpoint hands
 * them to the Announcements panel so the send still goes through the audience
 * picker and confirmation every other broadcast uses, rather than letting a deal
 * launch mail the whole customer list on one click.
 */
export function dealBroadcastDrafts(deal, { catalogUrl } = {}) {
  const pct = toPercent(deal?.discount_pct);
  const namesEn = joinNames(deal?.product_names || [], 'and');
  const namesEs = joinNames(deal?.product_names || [], 'y');
  const destination = catalogUrl || dealCatalogUrl(deal);
  const bulk = dealPricingMode(deal) === 'bulk_threshold';
  const requirementEn = bulk ? ` when you mix and match ${dealMinUnits(deal)}+ selected vials` : '';
  const requirementEs = bulk ? ` al combinar ${dealMinUnits(deal)}+ viales seleccionados` : '';

  if (dealPricingMode(deal) === OFFERS_PRICING_MODE) {
    const en = dealOfferSummaries(deal?.offers, 'en');
    const es = dealOfferSummaries(deal?.offers, 'es');
    return {
      emailSubject: `⚡ Deal of the Week: ${en.join(' or ')}`,
      message: [
        `⚡ *DEAL OF THE WEEK / OFERTA DE LA SEMANA*`,
        '',
        ...en.map((offer, index) => `Offer #${index + 1}: ${offer}.`),
        `Applied automatically, no code needed. If your order qualifies for both, you get whichever saves more — they do not stack. BAC Water does not count toward the offers. Stock is limited.`,
        `Ends Sunday at midnight.`,
        '',
        ...es.map((offer, index) => `Oferta #${index + 1}: ${offer}.`),
        `Se aplica automáticamente, sin código. Si tu pedido califica para ambas, recibes la que más ahorra; no se acumulan. El agua bacteriostática no cuenta para las ofertas. Inventario limitado.`,
        `Termina el domingo a medianoche.`,
        '',
        destination,
      ].join('\n'),
    };
  }

  return {
    emailSubject: `⚡ Deal of the Week: ${pct}% off ${namesEn}`,
    message: [
      `⚡ *DEAL OF THE WEEK / OFERTA DE LA SEMANA*`,
      '',
      `${pct}% off ${namesEn}${requirementEn} — automatically applied, no code needed.`,
      `One deal only: this does not stack with volume discounts or promo codes. Stock is limited.`,
      `Ends Sunday at midnight.`,
      '',
      `${pct}% de descuento en ${namesEs}${requirementEs} — se aplica automáticamente, sin código.`,
      `Una sola oferta: no se acumula con descuentos por volumen ni códigos. Inventario limitado.`,
      `Termina el domingo a medianoche.`,
      '',
      destination,
    ].join('\n'),
  };
}
