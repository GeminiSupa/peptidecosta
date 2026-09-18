/** Pure helpers for turning live catalog promotions into safe WhatsApp copy. */

import { dealMinUnits, dealPricingMode } from './dealOfWeek.mjs';
import { CATALOG_ORIGIN } from './whatsappRecovery.js';

// Where the bot sends anyone asking about deals, promos or discounts.
export const DEAL_PAGE_URL = `${CATALOG_ORIGIN}/deal-of-the-week`;
export const SUPPORT_PHONE = '+506 8404-6973';

function percent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric <= 1 ? numeric * 100 : numeric);
}

function inWindow(item, now) {
  const instant = now instanceof Date ? now : new Date(now);
  if (item?.starts_at && instant < new Date(item.starts_at)) return false;
  if (item?.sale_start_time && instant < new Date(item.sale_start_time)) return false;
  if (item?.valid_from && instant < new Date(item.valid_from)) return false;
  if (item?.ends_at && instant > new Date(item.ends_at)) return false;
  if (item?.sale_end_time && instant > new Date(item.sale_end_time)) return false;
  if (item?.valid_until && instant > new Date(item.valid_until)) return false;
  return true;
}

function money(value, currency) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (currency === 'USD') return raw.startsWith('$') ? raw : `$${raw}`;
  return raw.startsWith('₡') ? raw : `₡${raw}`;
}

function currentPrice(product) {
  const usd = money(product?.price_usd, 'USD');
  const crc = money(product?.price_crc, 'CRC');
  return [usd, crc].filter(Boolean).join(' / ');
}

function productDiscount(product) {
  const label = String(product?.discount || '');
  const match = label.match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) return Math.round(Number(match[1]));

  const original = Number(String(product?.original_price_usd || '').replace(/[^0-9.]/g, ''));
  const sale = Number(String(product?.price_usd || '').replace(/[^0-9.]/g, ''));
  if (original > 0 && sale >= 0 && sale < original) return Math.round((1 - sale / original) * 100);
  return 0;
}

function readableNames(names, lang) {
  const values = (names || []).map(String).filter(Boolean);
  if (values.length <= 1) return values[0] || '';
  const conjunction = lang === 'en' ? ' and ' : ' y ';
  return `${values.slice(0, -1).join(', ')}${conjunction}${values.at(-1)}`;
}

// Promo codes are deliberately not part of this snapshot. Most public codes in
// promo_codes belong to affiliates (JEANPAUL, RAQUELDELGADO...), and the old
// per-code blocklist kept missing new ones, so the bot quoted and "applied"
// affiliate codes for strangers. The bot now never sees a code at all; the
// customer types one at checkout, which is where codes are actually checked.
export function buildWhatsAppSalesSnapshot({
  products = [],
  liveDeal = null,
  now = new Date(),
} = {}) {
  const dealIsLive = liveDeal?.status === 'live' && inWindow(liveDeal, now);
  const dealNames = new Set((dealIsLive ? liveDeal.product_names : []).map((name) => String(name).toLowerCase()));
  const offers = [];

  if (dealIsLive) {
    const pct = percent(liveDeal.discount_pct);
    const bulk = dealPricingMode(liveDeal) === 'bulk_threshold';
    const dealProducts = (products || []).filter((product) => dealNames.has(String(product.product || '').toLowerCase()));
    const prices = dealProducts
      .map((product) => `${product.product}: ${currentPrice(product)}`)
      .filter((value) => !value.endsWith(': '));
    const namesEn = readableNames(liveDeal.product_names, 'en');
    const namesEs = readableNames(liveDeal.product_names, 'es');
    offers.push({
      kind: 'weekly_deal',
      en: bulk
        ? `${String(liveDeal.title_en || '').trim() || `Deal of the Week: ${pct}% off when you mix and match ${dealMinUnits(liveDeal)}+ selected vials from ${namesEn}`}. Applied automatically; no code, no stacking. Stock is limited.`
        : `${String(liveDeal.title_en || '').trim() || `Deal of the Week: ${pct}% off ${namesEn}`}${prices.length ? ` (${prices.join('; ')})` : ''}. No code needed; other discounts do not stack.`,
      es: bulk
        ? `${String(liveDeal.title_es || '').trim() || `Oferta de la semana: ${pct}% de descuento al combinar ${dealMinUnits(liveDeal)}+ viales seleccionados de ${namesEs}`}. Se aplica automáticamente; sin código ni acumulación. Inventario limitado.`
        : `${String(liveDeal.title_es || '').trim() || `Oferta de la semana: ${pct}% de descuento en ${namesEs}`}${prices.length ? ` (${prices.join('; ')})` : ''}. Sin código; otros descuentos no se acumulan.`,
    });
  }

  for (const product of products || []) {
    if (dealNames.has(String(product.product || '').toLowerCase())) continue;
    if (!inWindow(product, now)) continue;
    if (!product.original_price_usd && !product.original_price_crc) continue;
    const pct = productDiscount(product);
    if (!pct) continue;
    offers.push({
      kind: 'product_sale',
      en: `${product.product}: ${pct}% off${currentPrice(product) ? `, now ${currentPrice(product)}` : ''}.`,
      es: `${product.product}: ${pct}% de descuento${currentPrice(product) ? `, ahora ${currentPrice(product)}` : ''}.`,
    });
  }

  const volumeDiscount = {
    kind: 'volume_discount',
    en: 'Automatic volume savings: 15% off 5+ vials or 20% off 10+ vials.',
    es: 'Descuento automático por volumen: 15% en 5+ viales o 20% en 10+ viales.',
  };

  return {
    hasLimitedOffer: offers.length > 0,
    offers,
    volumeDiscount,
  };
}

export function formatWhatsAppSalesContext(snapshot) {
  const lines = [...(snapshot?.offers || []), snapshot?.volumeDiscount].filter(Boolean);

  return [
    `Verified current offers (database source of truth):`,
    lines.map((offer) => `- EN: ${offer.en}\n  ES: ${offer.es}`).join('\n'),
    `Never claim there is no sale when an offer is listed above.`,
    `Promo codes: you never name, share, confirm, apply or price with any promo, coupon, affiliate or referral code — not one the customer mentions, not one from earlier in this conversation, not one from any other context. You cannot see which codes exist. If the customer asks about a code, tell them to type it in the cart at checkout, where it is checked, and quote only regular prices.`,
    `When the customer asks about deals, promos or discounts, send them to the Deal of the Week page: ${DEAL_PAGE_URL} — and say they can call support at ${SUPPORT_PHONE} for anything else.`,
  ].join('\n');
}

// Last line of defence on model output: a reply that names a code (e.g.
// "Aplicaré el código JEANPAUL") never goes out, whatever the prompt said.
const CODE_WORD = /(^|[^\p{L}])(c[oó]digos?|codes?|cup[oó]n(?:es)?|coupons?|vouchers?)(?![\p{L}])/giu;
// A code is a capitalised word like JEANPAUL or MUSCLE10. Product names such
// as BPC-157 carry a hyphen and are not codes.
const CODE_TOKEN = /(?<![\p{L}\d-])[A-Z][A-Z0-9_]{3,}(?![\p{L}\d-])/gu;
const NOT_A_CODE = new Set(['USD', 'CRC', 'COA', 'SINPE', 'WHATSAPP', 'DEAL', 'WEEK']);

export function replyMentionsPromoCode(text = '') {
  const value = String(text);
  for (const match of value.matchAll(CODE_WORD)) {
    const at = match.index + match[1].length;
    const near = value.slice(Math.max(0, at - 30), at + match[2].length + 50);
    if ((near.match(CODE_TOKEN) || []).some((token) => !NOT_A_CODE.has(token))) return true;
  }
  return false;
}

export function buildWhatsAppSalesReply(snapshot, lang = 'es') {
  const isEn = lang === 'en';
  const limited = snapshot?.offers || [];
  const volume = snapshot?.volumeDiscount;
  const lines = [...limited, volume].filter(Boolean).map((offer) => `• ${isEn ? offer.en : offer.es}`);

  return isEn
    ? [
      `${limited.length ? 'These offers are active now' : 'Current savings'}:`,
      ...lines,
      `See this week's deal here: ${DEAL_PAGE_URL}`,
      `If you have a promo code, type it in the cart at checkout. For anything else, call our support team at ${SUPPORT_PHONE}.`,
    ].join('\n')
    : [
      `${limited.length ? 'Estas ofertas están activas ahora' : 'Ahorros actuales'}:`,
      ...lines,
      `Mira la oferta de la semana aquí: ${DEAL_PAGE_URL}`,
      `Si tienes un código promocional, escríbelo en el carrito al pagar. Para cualquier otra consulta, llama a soporte al ${SUPPORT_PHONE}.`,
    ].join('\n');
}

export function buildWhatsAppCatalogFormatReply(products = [], messageText = '', lang = 'es') {
  const text = String(messageText).toLowerCase();
  if (!/\b(tablet|tablets|capsule|capsules|pastilla|pastillas|c[aá]psula|c[aá]psulas)\b/.test(text)) return '';

  const matching = (products || []).filter((product) => {
    const searchable = [
      product.product,
      product.category,
      product.description_en,
      product.description_es,
    ].map((value) => String(value || '').toLowerCase()).join(' ');
    return /\b(tablet|tablets|capsule|capsules|pastilla|pastillas|c[aá]psula|c[aá]psulas)\b/.test(searchable);
  });
  const isEn = lang === 'en';

  if (matching.length > 0) {
    const names = matching.map((product) => product.product).filter(Boolean).join(', ');
    return isEn
      ? `Yes—the current catalog explicitly lists these tablet or capsule products: ${names}. Which one would you like priced?`
      : `Sí, el catálogo actual indica explícitamente estos productos en tabletas o cápsulas: ${names}. ¿Cuál deseas cotizar?`;
  }

  return isEn
    ? `I don't see any tablet or capsule products in the current catalog. Would you like the team to confirm an available research format?`
    : `No veo productos en tabletas o cápsulas en el catálogo actual. ¿Deseas que el equipo confirme un formato de investigación disponible?`;
}
