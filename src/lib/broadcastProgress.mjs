/**
 * Progress maths for in-flight broadcasts.
 *
 * scheduled_broadcasts does not store the original recipient count — the cron
 * rewrites custom_contacts with whatever is left after each batch. So the total
 * is derived: contacts already attempted (one marketing_delivery_events row per
 * contact+channel) plus contacts still queued in custom_contacts.
 *
 * A single contact can produce two events (whatsapp + email), so contact-level
 * counts always de-duplicate on contact_key; channel-level counts do not.
 */

export const TERMINAL_STATUSES = ['delivered', 'failed', 'suppressed', 'skipped', 'bounced', 'complained'];

/** Contacts still queued. The cron stores them comma-separated as "phone|email". */
export function countQueuedContacts(customContacts) {
  if (!customContacts || typeof customContacts !== 'string') return 0;
  return customContacts
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean).length;
}

/** Roll delivery-event rows up into contact-level and channel-level tallies. */
export function summarizeDeliveryEvents(events = []) {
  const byStatus = { delivered: 0, failed: 0, suppressed: 0, skipped: 0, processing: 0, bounced: 0, complained: 0 };
  const byChannel = { whatsapp: { delivered: 0, failed: 0, suppressed: 0 }, email: { delivered: 0, failed: 0, suppressed: 0 } };
  const contacts = new Set();
  const reached = new Set();

  for (const event of events || []) {
    if (!event) continue;
    const status = String(event.status || '').toLowerCase();
    const channel = String(event.channel || '').toLowerCase();
    const key = event.contact_key || '';

    if (key) contacts.add(key);
    if (status in byStatus) byStatus[status] += 1;

    if (byChannel[channel] && status in byChannel[channel]) byChannel[channel][status] += 1;

    // "Reached" means at least one channel actually delivered for that person.
    if (status === 'delivered' && key) reached.add(key);
  }

  return {
    byStatus,
    byChannel,
    attemptedContacts: contacts.size,
    reachedContacts: reached.size,
  };
}

/**
 * @returns {{total:number, attempted:number, remaining:number, reached:number,
 *            percent:number, failed:number, suppressed:number, inFlight:number,
 *            byChannel:object, isComplete:boolean}}
 */
export function computeBroadcastProgress({ events = [], customContacts = '', status = 'pending' } = {}) {
  const summary = summarizeDeliveryEvents(events);
  const attempted = summary.attemptedContacts;

  // The cron rewrites custom_contacts with the still-queued remainder before
  // processing each batch, but never clears it on completion - so a COMPLETED
  // broadcast is left holding its final batch, and counting that as "remaining"
  // double-counts people who were already attempted ("73 of 78" for a 73-person
  // blast). It can only complete once nothing genuinely remains, so zero it.
  //
  // A CANCELLED broadcast is different: its queue is people deliberately never
  // sent, which is real information ("stopped at 40 of 200") - keep counting it.
  const isTerminal = ['completed', 'cancelled'].includes(status);
  const remaining = status === 'completed' ? 0 : countQueuedContacts(customContacts);
  const total = attempted + remaining;

  const isComplete = isTerminal
    || (total > 0 && remaining === 0 && summary.byStatus.processing === 0);

  // When the blast ran: earliest and latest attempt across all recipients.
  let startedAt = null;
  let lastActivityAt = null;
  for (const event of events || []) {
    const first = new Date(event?.first_attempt_at || 0).getTime();
    const last = new Date(event?.last_attempt_at || event?.first_attempt_at || 0).getTime();
    if (first > 0 && (startedAt === null || first < startedAt)) startedAt = first;
    if (last > 0 && (lastActivityAt === null || last > lastActivityAt)) lastActivityAt = last;
  }

  return {
    total,
    attempted,
    remaining,
    reached: summary.reachedContacts,
    percent: total > 0 ? Math.round((attempted / total) * 100) : (isComplete ? 100 : 0),
    failed: summary.byStatus.failed + summary.byStatus.bounced,
    suppressed: summary.byStatus.suppressed + summary.byStatus.skipped,
    inFlight: summary.byStatus.processing,
    byChannel: summary.byChannel,
    isComplete,
    startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    lastActivityAt: lastActivityAt ? new Date(lastActivityAt).toISOString() : null,
  };
}

/**
 * Rough finish estimate. Batches self-chain (the cron re-invokes itself after
 * each batch of 10), so throughput is measured from observed attempt timestamps
 * rather than assumed from the cron schedule. Returns null when there is not
 * enough history to say anything honest.
 */
export function estimateCompletion(events = [], remaining = 0, now = Date.now()) {
  if (remaining <= 0) return null;

  const times = (events || [])
    .map((e) => new Date(e.first_attempt_at || e.last_attempt_at || 0).getTime())
    .filter((t) => Number.isFinite(t) && t > 0)
    .sort((a, b) => a - b);

  if (times.length < 5) return null;

  const elapsedMs = times[times.length - 1] - times[0];
  if (elapsedMs <= 0) return null;

  const perContactMs = elapsedMs / (times.length - 1);
  const remainingMs = perContactMs * remaining;

  return {
    perContactMs: Math.round(perContactMs),
    remainingMs: Math.round(remainingMs),
    finishesAt: new Date(now + remainingMs).toISOString(),
  };
}
