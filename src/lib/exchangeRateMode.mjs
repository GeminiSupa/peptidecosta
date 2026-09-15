/**
 * API or manual USD -> CRC rate.
 *
 * The shop normally follows a daily feed (CurrencyFreaks, with a keyless
 * backup — see RATE_PROVIDERS in pricing.js). A superadmin can instead set the
 * rate by hand, and then every colón price in the shop uses that number until
 * they switch back.
 *
 * Both live inside the one site_settings row `exchange_rate`, which
 * fix-checkout-limits-and-rate-lock.sql already locks against every browser
 * session, so the switch inherits that lock: only the server (service role),
 * behind a superadmin check, can write it.
 *
 * That row is also publicly READABLE (the catalog reads it), so nothing here
 * may store an email address — the person who set a rate is kept by name.
 *
 * Free of `@/` imports so tests/ can load it under `node --test`.
 */

import {
  MAX_PLAUSIBLE_RATE,
  MAX_RATE_DEVIATION_PCT,
  MIN_PLAUSIBLE_RATE,
  isPlausibleRate,
} from './pricing.js';

export const RATE_MODE_API = 'api';
export const RATE_MODE_MANUAL = 'manual';
export const RATE_HISTORY_LIMIT = 10;

export function roundRate(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * What the stored row says about the mode.
 *
 * A row written before this existed has no `mode` and is API mode. A row that
 * says manual but carries no usable manual number is also read as API mode,
 * so a damaged setting can never freeze the shop on garbage.
 */
export function readRateMode(value) {
  const manualRate = Number(value?.manual_rate);
  const isManual = value?.mode === RATE_MODE_MANUAL && isPlausibleRate(manualRate);
  const storedRate = Number(value?.usd_crc);
  const lastApiRate = isManual
    ? (isPlausibleRate(value?.last_api_rate) ? Number(value.last_api_rate) : null)
    : (isPlausibleRate(storedRate) ? storedRate : null);

  return {
    mode: isManual ? RATE_MODE_MANUAL : RATE_MODE_API,
    manualRate: isManual ? manualRate : null,
    manualSetAt: isManual ? (value?.manual_set_at || null) : null,
    manualSetBy: isManual ? (value?.manual_set_by || null) : null,
    lastApiRate,
  };
}

/**
 * Check a rate a superadmin typed.
 *
 * Outside ₡300–₡800 is refused outright — that catches an extra or missing
 * digit. Inside it, a number more than MAX_RATE_DEVIATION_PCT away from today's
 * API rate needs an explicit "yes, I'm sure": the same 5% line the feed itself
 * is not trusted to cross alone.
 */
export function checkManualRate({ rate, apiRate = null, confirmed = false } = {}) {
  const value = typeof rate === 'string' ? Number(rate.trim()) : Number(rate);
  if (!Number.isFinite(value) || !isPlausibleRate(value)) {
    return {
      ok: false,
      code: 'out_of_range',
      message: `Enter a rate between ₡${MIN_PLAUSIBLE_RATE} and ₡${MAX_PLAUSIBLE_RATE} per $1. Check for an extra or missing digit.`,
    };
  }

  const clean = roundRate(value);
  if (isPlausibleRate(apiRate)) {
    const deviationPct = Math.abs(clean - Number(apiRate)) / Number(apiRate) * 100;
    if (deviationPct > MAX_RATE_DEVIATION_PCT && !confirmed) {
      return {
        ok: false,
        code: 'needs_confirmation',
        deviationPct,
        message: `₡${clean} is ${deviationPct.toFixed(1)}% away from today's API rate (₡${roundRate(apiRate)}). `
          + 'Every colón price in the shop will use your number. Are you sure?',
      };
    }
  }
  return { ok: true, rate: clean };
}
