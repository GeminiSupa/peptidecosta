/**
 * Whether the website live chat presents itself as online.
 *
 * The widget used to hard-code 07:00–19:00 Costa Rica time, so the only way to
 * close the chat early — or keep it open late — was a code change and a deploy.
 * A superadmin now sets this from the dashboard:
 *
 *   auto    follow the schedule below (the default, and the old behaviour)
 *   online  always show as online, whatever the clock says
 *   offline always show as offline, e.g. a holiday or nobody on shift
 *
 * The hours are stored too, so the schedule itself can move without a deploy.
 * Kept dependency-free so both the API route and the tests can import it.
 */

export const LIVE_CHAT_AVAILABILITY_SETTING_ID = 'live_chat_availability';

export const LIVE_CHAT_MODES = ['auto', 'online', 'offline'];

export const DEFAULT_LIVE_CHAT_AVAILABILITY = {
  mode: 'auto',
  openHour: 7,
  closeHour: 19,
};

function clampHour(value, fallback) {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback;
  return hour;
}

/** Fills in anything missing or malformed rather than trusting a stored row. */
export function normalizeLiveChatAvailability(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const mode = LIVE_CHAT_MODES.includes(raw.mode) ? raw.mode : DEFAULT_LIVE_CHAT_AVAILABILITY.mode;
  const openHour = clampHour(raw.openHour, DEFAULT_LIVE_CHAT_AVAILABILITY.openHour);
  const closeHour = clampHour(raw.closeHour, DEFAULT_LIVE_CHAT_AVAILABILITY.closeHour);

  // An inverted range would make isWithinSchedule() always false and silently
  // take the chat offline for good, so fall back rather than store nonsense.
  if (openHour >= closeHour) return { ...DEFAULT_LIVE_CHAT_AVAILABILITY, mode };

  return { mode, openHour, closeHour };
}

export function isWithinSchedule(hour, { openHour, closeHour }) {
  if (!Number.isFinite(hour)) return true;
  return hour >= openHour && hour < closeHour;
}

/**
 * The one place that decides online vs offline.
 *
 * `hour` is the current hour in Costa Rica; pass null when it could not be
 * worked out, in which case the chat stays online rather than telling every
 * visitor it is closed because of a clock problem.
 */
export function isLiveChatOnline(availability, hour) {
  const config = normalizeLiveChatAvailability(availability);
  if (config.mode === 'online') return true;
  if (config.mode === 'offline') return false;
  return isWithinSchedule(hour === null || hour === undefined ? NaN : Number(hour), config);
}
