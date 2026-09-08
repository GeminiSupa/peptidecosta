/**
 * How fast a one-time announcement goes out, per channel.
 *
 * Email and WhatsApp are limited by different things — Meta rate-shapes
 * marketing WhatsApp and treats a burst as spam, while email is bounded by the
 * daily allowance on the shared Elastic login — so they get independent batch
 * sizes and independent waits. A run sends the channels whose turn has come and
 * leaves the others alone; the row is then re-queued for whichever is due
 * first.
 *
 * The old behaviour (10 per run, next run immediately) is what you get when
 * nothing is configured, so an existing broadcast paces exactly as before.
 */

export const DEFAULT_BATCH_SIZE = 10;
export const DEFAULT_DELAY_SECONDS = 0;

/** Hard ceilings. A typo in the form must not become a 10,000-message burst. */
export const MAX_BATCH_SIZE = 500;
export const MAX_DELAY_SECONDS = 86400; // 24h

/** Read one channel's settings off a broadcast row, clamped and defaulted. */
export function channelPacing(row, channel) {
  const size = toBoundedInt(row?.[`${channel}_batch_size`], DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
  const delay = toBoundedInt(row?.[`${channel}_batch_delay_seconds`], DEFAULT_DELAY_SECONDS, 0, MAX_DELAY_SECONDS);
  return { batchSize: size, delaySeconds: delay };
}

function toBoundedInt(value, fallback, min, max) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Whether a channel may send on this run.
 *
 * A missing timestamp means "never paced yet", which is the first run and must
 * go — otherwise a broadcast created before the columns existed would sit
 * forever waiting for a time that is never set.
 */
export function channelIsDue(row, channel, now = Date.now()) {
  const at = row?.[`${channel}_next_at`];
  if (!at) return true;
  const ms = Date.parse(at);
  return !Number.isFinite(ms) || ms <= now;
}

/**
 * Split the audience into this run's work and what is left over.
 *
 * Each channel walks its own queue: a contact reachable both ways can have its
 * email sent on one run and its WhatsApp several runs later. Only contacts the
 * channel can actually reach are counted against its batch, so a batch of 50
 * emails means 50 emails, not 50 contacts of whom nine had an address.
 */
export function planBatch(contacts, { emailDue, whatsappDue, emailBatchSize, whatsappBatchSize }) {
  const emailQueue = [];
  const whatsappQueue = [];

  for (const contact of contacts || []) {
    if (contact?.email) emailQueue.push(contact);
    if (contact?.phone) whatsappQueue.push(contact);
  }

  const emailNow = emailDue ? emailQueue.slice(0, emailBatchSize) : [];
  const whatsappNow = whatsappDue ? whatsappQueue.slice(0, whatsappBatchSize) : [];

  const emailSending = new Set(emailNow);
  const whatsappSending = new Set(whatsappNow);

  // One pass per contact this run, doing whichever channels came up.
  const sendNow = [];
  for (const contact of contacts || []) {
    const doEmail = emailSending.has(contact);
    const doWhatsapp = whatsappSending.has(contact);
    if (doEmail || doWhatsapp) sendNow.push({ contact, doEmail, doWhatsapp });
  }

  return {
    sendNow,
    emailRemaining: emailQueue.length - emailNow.length,
    whatsappRemaining: whatsappQueue.length - whatsappNow.length,
  };
}

/**
 * Re-encode what is still owed into the `phone|email` custom-contacts format.
 *
 * A contact keeps only the addresses that still have work: once its email has
 * gone but its WhatsApp has not, it is re-queued as a bare phone number. That
 * is what stops the next run re-sending a channel that already went.
 */
export function encodeRemaining(entries) {
  return (entries || [])
    .map(({ contact, doEmail, doWhatsapp }) => {
      const phone = contact?.phone && !doWhatsapp ? contact.phone : '';
      const email = contact?.email && !doEmail ? contact.email : '';
      if (phone && email) return `${phone}|${email}`;
      return phone || email || '';
    })
    .filter(Boolean);
}

/**
 * When each channel may next send, and when the row should be picked up.
 *
 * A channel with nothing left gets no next time at all — it must not hold the
 * broadcast open. The row itself wakes for whichever channel is due first.
 */
export function nextRunTimes({
  emailRemaining, whatsappRemaining,
  emailSentThisRun, whatsappSentThisRun,
  emailDelaySeconds, whatsappDelaySeconds,
  emailNextAt, whatsappNextAt,
  now = Date.now(),
}) {
  const nextEmail = emailRemaining > 0
    ? (emailSentThisRun ? now + emailDelaySeconds * 1000 : keepOrNow(emailNextAt, now))
    : null;
  const nextWhatsapp = whatsappRemaining > 0
    ? (whatsappSentThisRun ? now + whatsappDelaySeconds * 1000 : keepOrNow(whatsappNextAt, now))
    : null;

  const candidates = [nextEmail, nextWhatsapp].filter((t) => t !== null);
  return {
    emailNextAt: nextEmail === null ? null : new Date(nextEmail).toISOString(),
    whatsappNextAt: nextWhatsapp === null ? null : new Date(nextWhatsapp).toISOString(),
    scheduledAt: candidates.length ? new Date(Math.min(...candidates)).toISOString() : null,
    done: candidates.length === 0,
  };
}

function keepOrNow(value, now) {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : now;
}

/**
 * True when the next run can be fired immediately rather than left to the cron.
 *
 * The processor self-triggers to drain a broadcast quickly, which is right only
 * while nothing is waiting. With a delay configured, self-triggering would busy
 * -loop the function and defeat the pacing the operator asked for.
 */
export function canChainImmediately(scheduledAt, now = Date.now()) {
  if (!scheduledAt) return false;
  const ms = Date.parse(scheduledAt);
  return Number.isFinite(ms) && ms <= now;
}
