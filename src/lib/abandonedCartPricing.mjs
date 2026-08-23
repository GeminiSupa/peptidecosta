// Price for one line of a recovery email.
//
// Split out of the abandoned-cart route so it can be tested directly: the route
// file may only export HTTP handlers and route config, so nothing inside it can
// be reached from a test.
//
// The rate has to be passed in. Until 24 Aug 2026 the route called its row
// builder without one and the parameter defaulted to a hardcoded 454.48, so
// every recovery email quoted a price the catalog was not charging.

/** Strip currency symbols / separators from a stored price -> Number. */
export function parseCartPrice(value) {
  if (value === null || value === undefined) return 0;
  const parsed = parseFloat(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Unit price for a cart line in the email's currency.
 *
 * A USD price is authoritative and gets converted, because that is what the
 * catalog itself prices from. A stored colón price is only trusted when there
 * is no USD figure to convert — it may have been written at an older rate.
 *
 * @param {object} item cart line ({ priceUsd | price_usd | price | priceCrc })
 * @param {'USD'|'CRC'} currency
 * @param {number} exchangeRate USD -> CRC
 */
export function abandonedCartUnitPrice(item = {}, currency, exchangeRate) {
  const usdPrice = item.priceUsd || item.price_usd;
  const price = parseCartPrice(usdPrice || item.price);

  if (currency !== 'CRC') return price;

  if (usdPrice) return Math.round(price * exchangeRate);

  const storedCrc = item.priceCrc || item.price_crc;
  if (storedCrc) return parseCartPrice(storedCrc);

  return Math.round(price * exchangeRate);
}
