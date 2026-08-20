/**
 * Prices, as prices rather than as raw JavaScript numbers.
 *
 * The catalog used to build its dollar amounts with `` `$${val}` ``. That is
 * fine for a price read straight out of the database and wrong for anything
 * added up: 67.85 + 5.58 is 73.42999999999999 in binary floating point, and a
 * live cart showed a TOTAL DUE of "$73.42999999999999" on the order summary,
 * on the submit button, and in the WhatsApp receipt.
 *
 * Only the display was affected — the order total is rounded by the database
 * column and the card gateway is handed a `toFixed(2)` amount — but a checkout
 * button quoting fifteen decimal places is the kind of thing that stops a sale.
 */

/**
 * @param {number|string} value
 * @param {string} currency 'USD' shows cents; anything else is treated as CRC
 * @returns {string}
 */
export function formatPrice(value, currency) {
  const amount = Number(value) || 0;

  // Colones have no subunit in practice, and every colón amount in the catalog
  // is already whole.
  if (currency !== 'USD') {
    const colones = Math.round(amount);
    return `${colones < 0 ? '-' : ''}₡${Math.abs(colones).toLocaleString('en-US')}`;
  }

  const rounded = Math.round(amount * 100) / 100;
  // Sign in front of the symbol: "-$5.50", not "$-5.50".
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toLocaleString('en-US', {
    // Whole dollars keep their bare form ($70, not $70.00), which is how the
    // catalog has always shown a round price.
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${digits}`;
}

/** Round a money value to cents, for a total that is stored or charged. */
export function roundToCents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
