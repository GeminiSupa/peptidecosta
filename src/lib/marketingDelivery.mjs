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
