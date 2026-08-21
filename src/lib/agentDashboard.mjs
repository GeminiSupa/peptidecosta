const CR_OFFSET_MS = 6 * 60 * 60 * 1000;

export const AGENT_ANALYTICS_MAX_WEEK_OFFSET = 52;

const finiteDate = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function normalizeAgentWeekOffset(value) {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), AGENT_ANALYTICS_MAX_WEEK_OFFSET);
}

/** Monday-to-Sunday reporting boundaries anchored to Costa Rica (UTC-6). */
export function agentAnalyticsRange(nowValue = new Date(), offsetValue = 0) {
  const now = finiteDate(nowValue) || new Date();
  const weekOffset = normalizeAgentWeekOffset(offsetValue);
  const crNow = new Date(now.getTime() - CR_OFFSET_MS);

  const monthStartCr = new Date(crNow);
  monthStartCr.setUTCDate(1);
  monthStartCr.setUTCHours(0, 0, 0, 0);

  const todayStartCr = new Date(crNow);
  todayStartCr.setUTCHours(0, 0, 0, 0);

  const weekStartCr = new Date(crNow);
  const weekday = weekStartCr.getUTCDay();
  weekStartCr.setUTCDate(weekStartCr.getUTCDate() - (weekday === 0 ? 6 : weekday - 1) - weekOffset * 7);
  weekStartCr.setUTCHours(0, 0, 0, 0);

  const fullWeekEndCr = new Date(weekStartCr);
  fullWeekEndCr.setUTCDate(fullWeekEndCr.getUTCDate() + 7);
  const displayEndCr = new Date(fullWeekEndCr);
  displayEndCr.setUTCDate(displayEndCr.getUTCDate() - 1);

  const toUtc = (crDate) => new Date(crDate.getTime() + CR_OFFSET_MS);
  return {
    weekOffset,
    nowUtc: now.toISOString(),
    monthStartUtc: toUtc(monthStartCr).toISOString(),
    todayStartUtc: toUtc(todayStartCr).toISOString(),
    weekStartUtc: toUtc(weekStartCr).toISOString(),
    weekEndUtc: (weekOffset === 0 ? now : toUtc(fullWeekEndCr)).toISOString(),
    weekStartDate: weekStartCr.toISOString().slice(0, 10),
    weekEndDate: displayEndCr.toISOString().slice(0, 10),
  };
}

/** First valid paid/completed transition, independent of activity-log ordering. */
export function orderCompletedAtMs(order) {
  const createdAt = finiteDate(order?.created_at)?.getTime() ?? Number.NaN;
  const completionTimes = (Array.isArray(order?.activity_log) ? order.activity_log : [])
    .filter((entry) => entry?.type === 'status_change' && /paid|complet/i.test(String(entry?.message || '')))
    .map((entry) => finiteDate(entry?.at)?.getTime())
    .filter(Number.isFinite);
  return completionTimes.length ? Math.min(...completionTimes) : createdAt;
}

export function orderCompletedInRange(order, startValue, endValue) {
  const completedAt = orderCompletedAtMs(order);
  const start = finiteDate(startValue)?.getTime();
  const end = finiteDate(endValue)?.getTime();
  return Number.isFinite(completedAt) && Number.isFinite(start) && Number.isFinite(end)
    && completedAt >= start && completedAt < end;
}

/** Date-only database fields must not shift a day with the viewer's timezone. */
export function formatAgentDate(value, locale = undefined) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : finiteDate(value);
  if (!date) return '';
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function preferredAgentMoney(usd, crc, preferredCurrency = 'USD') {
  const currency = preferredCurrency === 'CRC' ? 'CRC' : 'USD';
  const value = currency === 'CRC' ? Number(crc || 0) : Number(usd || 0);
  return { currency, value: Number.isFinite(value) ? value : 0 };
}
