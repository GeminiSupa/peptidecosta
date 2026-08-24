/**
 * Every date an admin types means Costa Rica time, regardless of where the
 * admin sits.
 *
 * The team operates 11 hours ahead of the business (UTC+5 vs UTC-6). Left to
 * the browser's own timezone, a sale typed to end "Saturday 23:59" was stored
 * as Saturday 23:59 PAKISTAN time = Saturday 12:59 in Costa Rica - or worse,
 * whatever timezone the admin of the day happened to be in. Promo expiries and
 * sale windows kept dying half a day before what customers were promised.
 *
 * Costa Rica is UTC-6 year-round (no DST), which makes the conversion a fixed
 * offset and safe to do without a timezone library.
 */

export const CR_UTC_OFFSET_HOURS = 6; // Costa Rica is UTC minus 6, all year
const CR_OFFSET_MS = CR_UTC_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * A datetime-local input value ("2026-07-25T23:59"), read as CR wall time,
 * converted to the UTC instant to store. 23:59 in CR is 05:59 UTC next day.
 */
export function crWallToIso(wall) {
  if (!wall || typeof wall !== 'string') return null;
  const parsed = Date.parse(`${wall.length === 16 ? `${wall}:00` : wall}Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + CR_OFFSET_MS).toISOString();
}

/**
 * A stored UTC instant, shown as CR wall time for a datetime-local input.
 * Inverse of crWallToIso.
 */
export function isoToCrWall(iso) {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed - CR_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * The wall-clock hour (0-23) and weekday (0 = Sunday) in Costa Rica at a given
 * instant, or nulls when the instant cannot be read.
 *
 * The live chat needs both together to answer "is the shop open right now", and
 * reading them off the same converted value keeps them from disagreeing across
 * a midnight boundary.
 */
export function crHourAndDay(iso) {
  const wall = isoToCrWall(iso);
  if (!wall) return { hour: null, day: null };
  // The wall string is CR local time; read back as UTC it yields those same
  // clock fields without the browser's own zone getting a say.
  const parsed = Date.parse(`${wall}:00Z`);
  if (!Number.isFinite(parsed)) return { hour: null, day: null };
  const date = new Date(parsed);
  return { hour: date.getUTCHours(), day: date.getUTCDay() };
}

/** A bare date ("2026-07-25") extended to the last moment of that day in CR. */
export function crEndOfDayIso(dateStr) {
  if (!dateStr) return null;
  return crWallToIso(`${dateStr}T23:59:59.999`);
}

/** A bare date extended to the first moment of that day in CR. */
export function crStartOfDayIso(dateStr) {
  if (!dateStr) return null;
  return crWallToIso(`${dateStr}T00:00`);
}

/**
 * Human-readable confirmation of a typed CR wall time, in 24-hour clock:
 * "2026-07-25T23:59" -> like "sab 25 jul 2026, 23:59 (Costa Rica)".
 * The browser's own picker follows the admin's OS locale (often AM/PM), so
 * this line under the field is what removes the ambiguity.
 */
export function formatCrWall(wall) {
  const iso = crWallToIso(wall);
  if (!iso) return '';
  const formatted = new Intl.DateTimeFormat('es', {
    timeZone: 'America/Costa_Rica',
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
  return `${formatted} (Costa Rica)`;
}

/**
 * A stored instant formatted in Costa Rica time, with the caller's own fields.
 *
 * The list screens each want a different shape — "Aug 24, 07:50" on the orders
 * table, "24 Aug 2026" on inquiries — but every one of them means Costa Rica.
 * They were reading `toLocaleDateString` with no timezone, which is the
 * reader's own clock: an admin in Pakistan sits 11 hours ahead of the business,
 * so an order finished at 23:43 on the 23rd in Costa Rica was listed as the
 * 24th, while Revenue Today — which has always counted the Costa Rican day —
 * correctly left it in the 23rd. The list and the tile disagreed all evening,
 * every evening.
 *
 * Passing timeZone here rather than at each call site is what stops the next
 * screen from quietly going back to the reader's clock.
 *
 * The locale is pinned too, for the same reason the zone is: left as undefined
 * it follows the reader's machine, so the same order reads "Aug 23" for one
 * admin and "23 Aug" for another. en-US is what the commission emails and the
 * breakdown modal already used. Pass `locale` to override it.
 */
export function formatCrDate(value, options = {}) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const { locale = 'en-US', ...fields } = options;
  return new Intl.DateTimeFormat(locale, {
    ...fields,
    timeZone: 'America/Costa_Rica',
  }).format(date);
}

/** A stored instant shown as Costa Rica local time, 24-hour: "25/07/2026, 23:59 (CR)". */
export function formatCrInstant(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const formatted = new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
  return `${formatted} (CR)`;
}
