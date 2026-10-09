/**
 * On/off switch for recording browser calls.
 *
 * Lives in the one site_settings row `twilio_call_recording` so staff can flip
 * it from the Twilio tab instead of us redeploying. Recording costs Twilio
 * money per minute, and some calls should simply not be taped, so this has to
 * be something a person can turn off in the moment.
 *
 * The voice webhook is the only thing that reads it at call time. If that read
 * ever fails the call must still connect, so callers fall back to the shipped
 * default rather than dropping the call.
 *
 * Free of `@/` imports so tests/ can load it under `node --test`.
 */

export const CALL_RECORDING_SETTING_ID = 'twilio_call_recording';

// What a brand new install does. Matches the behaviour before the switch
// existed, so turning the feature on changes nothing until someone opts out.
export const CALL_RECORDING_DEFAULT_ENABLED = true;

// Twilio's value for "start taping as soon as it rings".
export const RECORD_FROM_RINGING = 'record-from-ringing';

/**
 * Read the stored row into a shape the UI and the webhook can both trust.
 *
 * A missing row, a null, or anything that is not an object is the default.
 * Only an explicit `false` turns recording off — a damaged setting must not
 * silently stop recording calls that staff believe are being recorded.
 */
export function readCallRecordingSetting(value) {
  const enabled = value && typeof value === 'object' && value.enabled === false
    ? false
    : CALL_RECORDING_DEFAULT_ENABLED;

  const source = value && typeof value === 'object' ? value : {};

  return {
    enabled,
    // Who flipped it last, by name. This row is only read by admin surfaces,
    // but we keep to the same rule as exchange_rate: no email addresses.
    changedBy: typeof source.changed_by === 'string' ? source.changed_by : null,
    changedAt: typeof source.changed_at === 'string' ? source.changed_at : null,
  };
}

/**
 * Build the row to store. Kept separate from the read so the webhook never
 * has to know the write shape.
 */
export function buildCallRecordingSetting({ enabled, changedBy = null } = {}) {
  return {
    enabled: enabled !== false,
    changed_by: typeof changedBy === 'string' && changedBy.trim() ? changedBy.trim() : null,
    changed_at: new Date().toISOString(),
  };
}

/**
 * The `record` attribute for the <Dial> verb, or '' when recording is off.
 * Returning the whole attribute keeps the TwiML template free of branching.
 */
export function dialRecordAttribute(enabled) {
  return enabled ? ` record="${RECORD_FROM_RINGING}"` : '';
}
