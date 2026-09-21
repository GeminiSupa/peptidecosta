/**
 * The one emergency USD -> CRC rate, used only when neither the API rate nor a
 * superadmin's manual rate can be read. It is not the rate the shop normally
 * charges — see src/lib/exchangeRate.js for that.
 *
 * Every other "fallback rate" name (FALLBACK_EXCHANGE_RATE in pricing.js,
 * ADMIN_FALLBACK_EXCHANGE_RATE, FALLBACK_USD_CRC_RATE) points here, so the
 * number is changed in one place. Plain .mjs with no imports so the unit tests
 * and every module can load it.
 */
export const FALLBACK_USD_CRC_RATE = 454.48;
