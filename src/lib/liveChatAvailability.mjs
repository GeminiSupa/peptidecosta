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
 * The schedule is per weekday, because the shop is not staffed the same way
 * every day — a short Saturday and a closed Sunday are normal. `openHour` and
 * `closeHour` stay as the fallback any day inherits until it is given its own
 * hours, which is also what makes a row saved before per-day support keep
 * working untouched.
 *
 * A day is stored as a list of ranges rather than one open/close pair. Today
 * the dashboard only ever writes one range per day, but a split shift (open,
 * closed over lunch, open again) then costs a picker rather than a migration
 * of a live setting.
 *
 * Every hour here is Costa Rica time — the caller converts before asking, see
 * crTime.mjs. Kept dependency-free so the API routes and the tests can import
 * it.
 */

export const LIVE_CHAT_AVAILABILITY_SETTING_ID = 'live_chat_availability';

export const LIVE_CHAT_MODES = ['auto', 'online', 'offline'];

/** Indexed by JavaScript's getDay(), so 0 is Sunday. */
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DAY_LABELS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** A working week reads Monday-first; only the storage keys are Sunday-first. */
export const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DEFAULT_LIVE_CHAT_AVAILABILITY = {
  mode: 'auto',
  openHour: 7,
  closeHour: 19,
  days: {},
};

function defaults() {
  // Fresh object each time: callers spread this and would otherwise share one
  // `days` between every normalized config in the process.
  return { ...DEFAULT_LIVE_CHAT_AVAILABILITY, days: {} };
}

function clampHour(value, fallback) {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback;
  return hour;
}

/**
 * A weekday 0-6, or null for anything that is not one.
 *
 * Guarded before Number(), which turns null, undefined, '' and [] into 0 — and
 * 0 is Sunday. An unknown day must not silently become whatever happens to be
 * saved for Sunday, which is exactly the day most likely to be closed.
 */
function toDayIndex(value) {
  const isNumberish = typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '');
  if (!isNumberish) return null;
  const day = Number(value);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  return day;
}

/**
 * One stored day, in any of the shapes the dashboard or an older row may hold:
 * `{ closed: true }`, `{ openHour, closeHour }`, or `{ ranges: [...] }`.
 * Returns a range list — empty means closed all day — or null for junk, which
 * the caller reads as "this day was never set" and inherits the base hours.
 */
function normalizeDay(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.closed === true) return [];

  const source = Array.isArray(value.ranges) ? value.ranges : [value];
  const ranges = [];
  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue;
    const openHour = clampHour(entry.openHour, null);
    const closeHour = clampHour(entry.closeHour, null);
    // An inverted or empty range would quietly shut the day, so it is dropped
    // rather than stored — the day falls back to the base hours instead.
    if (openHour === null || closeHour === null || openHour >= closeHour) continue;
    ranges.push({ openHour, closeHour });
  }

  if (!ranges.length) {
    // `{ ranges: [] }` is a deliberate "closed"; junk that produced nothing is
    // not, and inherits instead.
    return Array.isArray(value.ranges) ? [] : null;
  }

  ranges.sort((a, b) => a.openHour - b.openHour);
  return ranges;
}

/** Fills in anything missing or malformed rather than trusting a stored row. */
export function normalizeLiveChatAvailability(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const mode = LIVE_CHAT_MODES.includes(raw.mode) ? raw.mode : DEFAULT_LIVE_CHAT_AVAILABILITY.mode;
  const openHour = clampHour(raw.openHour, DEFAULT_LIVE_CHAT_AVAILABILITY.openHour);
  const closeHour = clampHour(raw.closeHour, DEFAULT_LIVE_CHAT_AVAILABILITY.closeHour);

  const days = {};
  if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    for (const [key, entry] of Object.entries(raw.days)) {
      const day = toDayIndex(key);
      if (day === null) continue;
      const ranges = normalizeDay(entry);
      if (ranges === null) continue;
      days[day] = { ranges };
    }
  }

  // An inverted base range would leave every inheriting day permanently shut,
  // so fall back rather than store nonsense. Per-day hours already saved are
  // kept: they are individually valid and the superadmin meant them.
  if (openHour >= closeHour) return { ...defaults(), mode, days };

  return { mode, openHour, closeHour, days };
}

/** 7 -> "7am", 19 -> "7pm", 0 -> "12am". Shared so the dashboard picker and
 *  the visitor-facing copy can never describe the same hour differently. */
export function formatHour12(hour24) {
  // Guarded before Number(), which turns null, '' and [] into 0 and would
  // render a missing hour as a confident "12am".
  const isNumberish = typeof hour24 === 'number'
    || (typeof hour24 === 'string' && hour24.trim() !== '');
  if (!isNumberish) return '';

  const hour = Number(hour24);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return '';
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}${suffix}`;
}

/**
 * The hours that apply on one weekday: its own if it has been given any, the
 * base hours if not. `day` outside 0-6 (or unknown) gets the base hours, which
 * is what keeps the chat open when the date could not be worked out.
 */
export function scheduleForDay(availability, day) {
  const config = normalizeLiveChatAvailability(availability);
  const key = toDayIndex(day);
  const own = key === null ? null : config.days[key];
  const ranges = own ? own.ranges : [{ openHour: config.openHour, closeHour: config.closeHour }];
  return { ranges, closed: ranges.length === 0, inherited: !own };
}

/**
 * Whether an hour falls inside a schedule. Accepts either a day (`{ ranges }`)
 * or the base hours (`{ openHour, closeHour }`).
 *
 * An hour that is not a real number means the clock could not be read, and
 * returns true: better to answer out of hours than to tell every visitor the
 * shop is shut because of a timezone problem.
 */
export function isWithinSchedule(hour, schedule) {
  if (!Number.isFinite(hour)) return true;
  const ranges = Array.isArray(schedule?.ranges)
    ? schedule.ranges
    : [{ openHour: schedule?.openHour, closeHour: schedule?.closeHour }];
  return ranges.some((range) => hour >= range.openHour && hour < range.closeHour);
}

/**
 * The one place that decides online vs offline.
 *
 * `hour` and `day` are the current hour and weekday in Costa Rica. Pass null
 * for either when it could not be worked out: an unknown hour keeps the chat
 * online, and an unknown day falls back to the base hours rather than to one
 * particular day's.
 */
export function isLiveChatOnline(availability, hour, day = null) {
  const config = normalizeLiveChatAvailability(availability);
  if (config.mode === 'online') return true;
  if (config.mode === 'offline') return false;

  const schedule = scheduleForDay(config, day);
  return isWithinSchedule(hour === null || hour === undefined ? NaN : Number(hour), schedule);
}

/**
 * When the chat next opens, as `{ day, openHour }`, scanning from `day` at
 * `hour` through the following week. Null when every day is closed, so the
 * caller writes "we are closed" rather than promising a time that never comes.
 */
export function nextOpening(availability, day, hour) {
  const config = normalizeLiveChatAvailability(availability);
  const startDay = toDayIndex(day);
  if (startDay === null) return null;
  const fromHour = Number.isFinite(Number(hour)) ? Number(hour) : 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const current = (startDay + offset) % 7;
    const { ranges } = scheduleForDay(config, current);
    for (const range of ranges) {
      // Today only counts if it has not already started; later days count from
      // their first range.
      if (offset > 0 || range.openHour > fromHour) {
        return { day: current, openHour: range.openHour };
      }
    }
  }
  return null;
}

/**
 * One day's stored entry, built from an edit and the hours currently on screen.
 *
 * `patch` is what the superadmin just changed — `{ closed: true }`, an
 * `openHour`, a `closeHour`, or both — and `base` is the day's existing hours,
 * so changing only the closing time of a day cannot silently reset its opening
 * time. The closing hour is pulled up behind an opening hour that overtakes it,
 * because an inverted range is dropped on normalize and the day would fall back
 * to the shared hours without anyone being told.
 */
export function buildDayEntry(patch = {}, base = DEFAULT_LIVE_CHAT_AVAILABILITY) {
  if (patch.closed) return { ranges: [] };

  const fallbackOpen = clampHour(base?.openHour, DEFAULT_LIVE_CHAT_AVAILABILITY.openHour);
  const fallbackClose = clampHour(base?.closeHour, DEFAULT_LIVE_CHAT_AVAILABILITY.closeHour);
  // 23 could never be an opening hour: closing has to be later, and there is no
  // later hour in the day.
  const openHour = Math.min(clampHour(patch.openHour, fallbackOpen), 22);
  const closeHour = Math.min(Math.max(clampHour(patch.closeHour, fallbackClose), openHour + 1), 23);

  return { ranges: [{ openHour, closeHour }] };
}

/** "7am–7pm", "7am–12pm, 2pm–7pm", or the given closed wording. */
export function formatDayHours(ranges, closedLabel = 'Closed') {
  if (!Array.isArray(ranges) || ranges.length === 0) return closedLabel;
  return ranges
    .map((range) => `${formatHour12(range.openHour)}–${formatHour12(range.closeHour)}`)
    .join(', ');
}

/**
 * A one-line summary for the dashboard button: the base hours, plus how many
 * days have been given their own — enough to see at a glance that the week is
 * not uniform without opening the panel.
 */
export function summarizeSchedule(availability) {
  const config = normalizeLiveChatAvailability(availability);
  const base = `${formatHour12(config.openHour)}–${formatHour12(config.closeHour)}`;
  const custom = Object.keys(config.days).length;
  if (!custom) return base;
  if (custom === 7) {
    const closed = Object.values(config.days).filter((entry) => entry.ranges.length === 0).length;
    return closed ? `Set per day · ${closed} closed` : 'Set per day';
  }
  return `${base} · ${custom} ${custom === 1 ? 'day differs' : 'days differ'}`;
}
