/**
 * The sale countdown.
 *
 * A banner can carry an end time, and the storefront turns it into a live
 * "ends in 12h 04m" strip. The arithmetic and the wording live here, free of
 * React and of '@/lib', so the behaviour can be tested without a browser and
 * without a clock — every function takes `now` rather than reading it.
 *
 * NOT LIVE. SALE_COUNTDOWN_ENABLED is the master switch and it is off, so
 * nothing renders on the storefront however a banner is configured. Flip this
 * one constant to true to turn the feature on everywhere at once; there is no
 * second place to remember.
 */

/** Master switch. Off until the owner approves the design. */
export const SALE_COUNTDOWN_ENABLED = false;

/**
 * Below this the strip switches to its urgent styling. One hour, because that
 * is the point where "today" stops being a useful thing to tell someone.
 */
export const COUNTDOWN_URGENT_MS = 60 * 60 * 1000;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A date from the database, or null when it is missing or unparseable. */
export function parseEndsAt(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Time left, split for display.
 *
 * `expired` is its own flag rather than a negative total, because a countdown
 * that has run out must not render as "0h 00m" — that reads as still running.
 */
export function countdownParts(endsAt, now = new Date()) {
  const end = parseEndsAt(endsAt);
  if (!end) return null;

  const remaining = end.getTime() - (now instanceof Date ? now : new Date(now)).getTime();
  if (remaining <= 0) {
    return { expired: true, urgent: false, total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    expired: false,
    urgent: remaining <= COUNTDOWN_URGENT_MS,
    total: remaining,
    days: Math.floor(remaining / DAY),
    hours: Math.floor((remaining % DAY) / HOUR),
    minutes: Math.floor((remaining % HOUR) / MINUTE),
    seconds: Math.floor((remaining % MINUTE) / 1000),
  };
}

/**
 * Should this banner show a countdown at all?
 *
 * Four things have to agree: the feature is on, the banner opted in, it carries
 * a readable end time, and that time has not passed. An expired sale showing a
 * dead clock is worse than showing nothing.
 */
export function shouldShowCountdown(banner, now = new Date(), enabled = SALE_COUNTDOWN_ENABLED) {
  if (!enabled) return false;
  if (!banner?.countdownEnabled) return false;
  const parts = countdownParts(banner.countdownEndsAt, now);
  return Boolean(parts && !parts.expired);
}

const pad = (value) => String(value).padStart(2, '0');

/**
 * The clock itself, e.g. "1d 06h 32m" or "04:31:09".
 *
 * Seconds appear only inside the final hour. A ticking seconds digit two days
 * out is noise that costs a re-render every second for nothing; in the last
 * hour it is the entire point.
 */
export function formatCountdown(parts) {
  if (!parts || parts.expired) return null;
  if (parts.days > 0) return `${parts.days}d ${pad(parts.hours)}h ${pad(parts.minutes)}m`;
  if (!parts.urgent) return `${pad(parts.hours)}h ${pad(parts.minutes)}m`;
  return `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
}

/** "Ends in" / "Termina en", or the last-hour wording. */
export function countdownLabel(parts, lang = 'es') {
  if (!parts || parts.expired) return null;
  const isEn = String(lang).toLowerCase().startsWith('en');
  if (parts.urgent) return isEn ? 'Last hour' : 'Última hora';
  return isEn ? 'Ends in' : 'Termina en';
}

/**
 * How often the strip needs to re-render.
 *
 * Every second only matters when seconds are on screen. Above that a minute is
 * enough, which keeps a two-day countdown from waking the main thread 86,400
 * times for a digit nobody is watching.
 */
export function countdownTickMs(parts) {
  if (!parts || parts.expired) return null;
  return parts.urgent ? 1000 : MINUTE;
}
