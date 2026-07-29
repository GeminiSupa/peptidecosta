/**
 * Reads the notification_recipients table — the single list behind
 * "who gets told about a new order".
 *
 * The table arrives with add-notification-recipients.sql. Until that migration
 * is run, every read here reports `available: false` and the caller keeps using
 * the old per-member toggles on admin_profiles. Deploying this code before
 * running the SQL therefore changes nothing, and the migration seeds the table
 * from those same toggles so switching over changes nobody's alerts either.
 */

export const NOTIFICATION_CHANNELS = ['whatsapp', 'email'];
export const NOTIFICATION_TYPES = ['new_order'];

/** PostgREST says "relation does not exist" one way and "schema cache" another. */
export function isMissingRecipientsTable(error) {
  if (!error) return false;
  const message = String(error.message || '');
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (/notification_recipients/i.test(message) &&
      /does not exist|schema cache|could not find/i.test(message))
  );
}

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

/** Trims and lowercases an address; strips everything but digits from a phone. */
export function normalizeDestination(channel, destination) {
  return channel === 'whatsapp'
    ? digitsOnly(destination)
    : String(destination ?? '').trim();
}

export function isUsableDestination(channel, destination) {
  const value = normalizeDestination(channel, destination);
  if (channel === 'whatsapp') return value.length >= 8 && value.length <= 15;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Active destinations for one alert type on one channel.
 *
 * Returns `{ available: false }` when the table is absent so callers can tell
 * "the migration has not run" apart from "the list is deliberately empty" —
 * treating those the same is how the order WhatsApp alert would silently stop.
 */
export async function getNotificationRecipients(supabase, {
  channel,
  type = 'new_order',
} = {}) {
  if (!NOTIFICATION_TYPES.includes(type)) {
    throw new Error(`Unknown notification type: ${type}`);
  }

  const { data, error } = await supabase
    .from('notification_recipients')
    .select('label, channel, destination, active, new_order')
    .eq('channel', channel)
    .eq('active', true)
    .eq(type, true);

  if (error) {
    if (isMissingRecipientsTable(error)) return { available: false, recipients: [] };
    throw new Error(error.message);
  }

  const seen = new Set();
  const recipients = [];
  for (const row of data || []) {
    if (!isUsableDestination(channel, row.destination)) continue;
    const destination = normalizeDestination(channel, row.destination);
    const key = destination.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ label: row.label || destination, destination });
  }

  return { available: true, recipients };
}
