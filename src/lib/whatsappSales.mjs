/** Pure helpers for turning live catalog promotions into safe WhatsApp copy. */

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

function activePublicPromo(promo, now) {
  if (!promo?.is_active || promo.hidden) return false;
  if (!inWindow(promo, now)) return false;
  if (
    promo.usage_limit !== null
    && promo.usage_limit !== undefined
    && Number(promo.usage_count || 0) >= Number(promo.usage_limit)
  ) return false;
  return percent(promo.discount_pct) > 0;
}

export function buildWhatsAppSalesSnapshot({ products = [], promos = [], liveDeal = null, now = new Date() } = {}) {
  const dealIsLive = liveDeal?.status === 'live' && inWindow(liveDeal, now);
  const dealNames = new Set((dealIsLive ? liveDeal.product_names : []).map((name) => String(name).toLowerCase()));
  const offers = [];

  if (dealIsLive) {
    const pct = percent(liveDeal.discount_pct);
    const dealProducts = (products || []).filter((product) => dealNames.has(String(product.product || '').toLowerCase()));
    const prices = dealProducts
      .map((product) => `${product.product}: ${currentPrice(product)}`)
      .filter((value) => !value.endsWith(': '));
    const namesEn = readableNames(liveDeal.product_names, 'en');
    const namesEs = readableNames(liveDeal.product_names, 'es');
    offers.push({
      kind: 'weekly_deal',
      en: `${String(liveDeal.title_en || '').trim() || `Deal of the Week: ${pct}% off ${namesEn}`}${prices.length ? ` (${prices.join('; ')})` : ''}. No code needed.`,
      es: `${String(liveDeal.title_es || '').trim() || `Oferta de la semana: ${pct}% de descuento en ${namesEs}`}${prices.length ? ` (${prices.join('; ')})` : ''}. No requiere código.`,
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

  for (const promo of (promos || []).filter((item) => activePublicPromo(item, now))) {
    const pct = percent(promo.discount_pct);
    const code = String(promo.code || '').trim().toUpperCase();
    if (!code) continue;
    const target = String(promo.target_product || '').trim();
    const unitTermsEn = promo.min_units ? `; minimum ${promo.min_units} units` : '';
    const unitTermsEs = promo.min_units ? `; mínimo ${promo.min_units} unidades` : '';
    offers.push({
      kind: 'promo_code',
      en: `Code ${code}: ${pct}% off${target ? ` ${target}` : ''}${unitTermsEn}. Eligibility is confirmed at checkout.`,
      es: `Código ${code}: ${pct}% de descuento${target ? ` en ${target}` : ''}${unitTermsEs}. La elegibilidad se confirma al pagar.`,
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
  return `Verified current offers (database source of truth):\n${lines.map((offer) => `- EN: ${offer.en}\n  ES: ${offer.es}`).join('\n')}\nNever claim there is no sale when an offer is listed above.`;
}

export function buildWhatsAppSalesReply(snapshot, lang = 'es') {
  const isEn = lang === 'en';
  const limited = snapshot?.offers || [];
  const volume = snapshot?.volumeDiscount;

  if (limited.length > 0) {
    const lines = [...limited, volume].filter(Boolean).map((offer) => `• ${isEn ? offer.en : offer.es}`);
    return isEn
      ? `Yes—these offers are active now:\n${lines.join('\n')}\nWhich offer would you like me to price for you?`
      : `Sí, estas ofertas están activas ahora:\n${lines.join('\n')}\n¿Cuál oferta deseas que te coticemos?`;
  }

  return isEn
    ? `There isn't a public weekly deal or promo code active right now, but ${volume.en.charAt(0).toLowerCase()}${volume.en.slice(1)} Which product would you like me to price?`
    : `No hay una oferta semanal ni un código promocional público activo en este momento, pero hay ${volume.es.charAt(0).toLowerCase()}${volume.es.slice(1)} ¿Qué producto deseas que te coticemos?`;
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
