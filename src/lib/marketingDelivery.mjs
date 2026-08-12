export function normalizeMarketingIdentity(value, channel) {
  const raw = String(value || '').trim();
  return channel === 'email' ? raw.toLowerCase() : raw.replace(/\D/g, '');
}

export function suppressionKey(identity, channel) {
  return `${normalizeMarketingIdentity(identity, channel)}:${channel}`;
}

export function isMarketingSuppressed(suppressions, identity, channel) {
  const normalized = normalizeMarketingIdentity(identity, channel);
  return suppressions.has(`${normalized}:${channel}`) || suppressions.has(`${normalized}:all`);
}

export function canRetryDelivery(event, maxAttempts = 3) {
  if (!event) return true;
  if (['delivered', 'suppressed', 'bounced', 'complained'].includes(event.status)) return false;
  return Number(event.attempt_count || 0) < maxAttempts;
}

export function mapProviderDeliveryStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (['delivered', 'delivery', 'sent'].includes(status)) return 'delivered';
  if (['bounce', 'bounced', 'hard_bounce', 'hard-bounce'].includes(status)) return 'bounced';
  if (['complaint', 'complained', 'spam', 'spam_complaint'].includes(status)) return 'complained';
  if (['deferred', 'soft_bounce', 'soft-bounce', 'temporary_failure'].includes(status)) return 'failed';
  if (['failed', 'dropped', 'rejected', 'blocked'].includes(status)) return 'failed';
  return null;
}

export function shouldSuppressForDeliveryStatus(status) {
  return status === 'bounced' || status === 'complained';
}

// A 5xx that names the recipient is a dead address: retrying it forever keeps a
// campaign from ever reaching "sent". A 5xx about *us* — auth, relaying, spam
// scoring, rate limits — must never suppress the recipient, or one bad sender
// config would quietly burn the whole list.
const SENDER_SIDE_FAILURE_PATTERNS = [
  /sender/i,
  /authenticat/i,
  /auth failed/i,
  /not authori[sz]ed/i,
  /relay/i,
  /spam/i,
  /blocked/i,
  /black ?list/i,
  /block ?list/i,
  /rate limit/i,
  /quota/i,
  /too many/i,
  /policy/i,
  /greylist/i,
  /try again/i,
  /reputation/i,
];

const HARD_BOUNCE_PATTERNS = [
  /user unknown/i,
  /unknown user/i,
  /no such user/i,
  /no such recipient/i,
  /no such address/i,
  /recipient (address )?rejected/i,
  /address rejected/i,
  /invalid recipient/i,
  /recipient not found/i,
  /mailbox (is )?unavailable/i,
  /mailbox not found/i,
  /mailbox does not exist/i,
  /does ?n[o']t exist/i,
  /account (has been )?(disabled|suspended|closed)/i,
  /unrouteable address/i,
  /domain not found/i,
  /5\.1\.(1|2|3|10)\b/,
];

/**
 * Classifies a nodemailer/SMTP send failure.
 * Returns 'hard' only when the address itself is provably dead — everything
 * else is 'soft' so a transient outage never costs us a subscriber.
 */
export function classifySmtpFailure(error) {
  const code = Number(error?.responseCode);
  if (!Number.isFinite(code) || code < 500 || code > 599) return 'soft';

  const text = `${error?.response || ''} ${error?.message || ''}`;
  if (SENDER_SIDE_FAILURE_PATTERNS.some(pattern => pattern.test(text))) return 'soft';
  return HARD_BOUNCE_PATTERNS.some(pattern => pattern.test(text)) ? 'hard' : 'soft';
}
