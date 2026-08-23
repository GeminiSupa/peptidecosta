/**
 * Timing rules for lead alerts.
 *
 * Who receives an alert is answered by src/lib/leadAlertAudience.mjs, which
 * reads the owning agent off their team profile. That used to be split across a
 * recipient merge here and a filter there; one module now decides it, because
 * two implementations of "who gets told" is how an agent stops being told.
 */

export function responseDeadline(now, minutes = 15) {
  const safeMinutes = Math.min(1440, Math.max(5, Number(minutes) || 15));
  return new Date(new Date(now).getTime() + safeMinutes * 60 * 1000).toISOString();
}
