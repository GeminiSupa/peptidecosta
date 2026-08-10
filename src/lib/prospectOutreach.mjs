/**
 * 1:1 prospect outreach: who may be contacted, what the AI is asked to write,
 * and how a Cal.com booking finds its way back to the prospect it came from.
 *
 * Everything here is pure so the rules that decide whether a cold message may
 * be sent can be tested without SMTP, Meta, or a database.
 */

export const OUTREACH_CHANNELS = ['email', 'whatsapp'];

/**
 * Permission states that authorise a first cold touch.
 *
 * `unknown` is deliberately excluded. The enricher only records
 * `business_contact` when it found the address published as a real mailto/tel
 * on the company's own site, so "unknown" means nobody has established a
 * lawful basis yet — exactly the case where a cold send is indefensible.
 */
const CONTACTABLE_PERMISSIONS = new Set(['business_contact', 'consented']);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Meta rejects free-form sends to people who never wrote in; see canContactProspect. */
export const WHATSAPP_HANDOFF_REASON = 'whatsapp_requires_manual_send';

const clean = (value, limit = 2000) => String(value ?? '').trim().slice(0, limit);

export function normalizeOutreachChannel(value) {
  const channel = clean(value, 20).toLowerCase();
  return OUTREACH_CHANNELS.includes(channel) ? channel : null;
}

export function prospectWhatsAppNumber(prospect = {}) {
  const candidates = [...(prospect.whatsapp_numbers || []), prospect.phone];
  for (const candidate of candidates) {
    const digits = String(candidate || '').replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) return digits;
  }
  return null;
}

/**
 * The single gate every send passes through, on the server, every time.
 *
 * @returns {{allowed: boolean, reason: string, identity: string|null, basis: string|null}}
 */
export function canContactProspect(prospect, channel) {
  const normalizedChannel = normalizeOutreachChannel(channel);
  if (!prospect) return { allowed: false, reason: 'Prospect not found.', identity: null, basis: null };
  if (!normalizedChannel) return { allowed: false, reason: 'Choose email or WhatsApp.', identity: null, basis: null };

  const permission = prospect.contact_permission_status || 'unknown';
  if (permission === 'do_not_contact' || prospect.status === 'do_not_contact') {
    return { allowed: false, reason: 'This prospect is marked do not contact.', identity: null, basis: null };
  }
  if (!CONTACTABLE_PERMISSIONS.has(permission)) {
    return {
      allowed: false,
      reason: 'Contact permission is still unknown. Run decision-maker discovery, or set the permission manually once you have verified a published business contact.',
      identity: null,
      basis: null,
    };
  }

  if (normalizedChannel === 'email') {
    const email = clean(prospect.email, 240).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      return { allowed: false, reason: 'No valid work email saved for this prospect.', identity: null, basis: null };
    }
    return { allowed: true, reason: '', identity: email, basis: permission };
  }

  const number = prospectWhatsAppNumber(prospect);
  if (!number) {
    return { allowed: false, reason: 'No usable WhatsApp number saved for this prospect.', identity: null, basis: null };
  }
  return { allowed: true, reason: '', identity: number, basis: permission };
}

/**
 * WhatsApp's first touch is a human hand-off, not an automated send.
 *
 * The Cloud API only accepts free-form messages inside a 24-hour window opened
 * by the recipient, and cold outreach has no such window. Sending anyway means
 * a rejected call at best and a flagged business number at worst. So the draft
 * is handed to the rep as a prefilled wa.me link: same words, same logging,
 * but a person presses send and the number stays healthy.
 */
export function whatsappHandoffUrl(number, message) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(clean(message, 1500))}`;
}

export function generateBookingToken(randomUUID) {
  return `pr_${String(randomUUID()).replaceAll('-', '')}`;
}

/**
 * Cal.com passes unrecognised `metadata[...]` query params straight through to
 * the webhook, which is how an anonymous booking is attributed to a prospect.
 */
export function buildBookingUrl(baseUrl, token) {
  const base = clean(baseUrl, 500);
  if (!base) return null;
  if (!token) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}metadata[prospectToken]=${encodeURIComponent(token)}`;
}

function prospectContext(prospect) {
  const lines = [
    `Business: ${prospect.organization_name}`,
    prospect.category && `Category: ${prospect.category}`,
    [prospect.city, prospect.region, prospect.country].filter(Boolean).join(', ') && `Location: ${[prospect.city, prospect.region, prospect.country].filter(Boolean).join(', ')}`,
    prospect.website_url && `Website: ${prospect.website_url}`,
  ];
  const decisionMaker = (prospect.people || []).find((person) => person?.full_name);
  if (decisionMaker) {
    lines.push(`Contact: ${decisionMaker.full_name}${decisionMaker.job_title ? ` (${decisionMaker.job_title})` : ''}`);
  }
  if (prospect.notes) lines.push(`Internal notes: ${clean(prospect.notes, 600)}`);
  return lines.filter(Boolean).join('\n');
}

export function buildOutreachPrompt(prospect, { channel, bookingUrl, language = 'auto' } = {}) {
  const isEmail = channel === 'email';
  const decisionMaker = (prospect.people || []).find((person) => person?.full_name);
  const languageRule = language === 'es'
    ? 'Write in Spanish.'
    : language === 'en'
      ? 'Write in English.'
      : 'Write in the language the business most likely uses day to day, inferred from its country and website. Default to Spanish for Costa Rica and the rest of Latin America, English elsewhere.';

  return `You write first-touch B2B outreach for "Peptides Costa Rica", a research peptide supplier that partners with gyms, wellness centers, clinics, and laboratories.

Prospect:
${prospectContext(prospect)}

Task: write one short ${isEmail ? 'cold email' : 'WhatsApp message'} proposing a 15-minute intro call.

${languageRule}

Rules:
- ${isEmail ? 'Under 120 words.' : 'Under 70 words, written for chat — no salutation block, no signature.'}
- Open with something specific and true about THIS business, taken only from the details above. Never invent facts, staff names, or achievements.
- ${decisionMaker ? `Address ${decisionMaker.full_name} by first name.` : 'Do not invent a contact name; address the business.'}
- One clear ask: book a 15-minute call using this link, which you must include verbatim exactly once: ${bookingUrl}
- Never make medical, dosage, therapeutic, or human-use claims. These are research products. No health outcomes, no dosing, no "treatment".
- No hype, no superlatives, no "I hope this email finds you well", no fake urgency.
- State plainly that we found them through their public business listing.

Return ONLY minified JSON: {"subject":"…","body":"…"}${isEmail ? ' — subject under 60 characters, no emoji.' : ' — leave subject as an empty string.'}`;
}

/** Pulls the model's JSON out even when it wraps it in prose or a code fence. */
export function parseDraftResponse(raw) {
  const text = clean(raw, 8000);
  if (!text) return { subject: '', body: '' };

  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(fenced.slice(start, end + 1));
      return { subject: clean(parsed.subject, 200), body: clean(parsed.body, 4000) };
    } catch {
      // Fall through to treating the whole response as the body.
    }
  }
  return { subject: '', body: clean(fenced, 4000) };
}

/**
 * Last line of defence before a draft reaches a human's screen.
 *
 * A model that drops the booking link produces a message with no call to
 * action, and one that repeats it looks like spam — so the link is normalised
 * to exactly one occurrence rather than trusted.
 */
export function sanitizeOutreachDraft({ subject, body }, { channel, bookingUrl, organizationName = '' } = {}) {
  let cleanBody = clean(body, 4000)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (bookingUrl) {
    const occurrences = cleanBody.split(bookingUrl).length - 1;
    if (occurrences > 1) {
      let seen = false;
      cleanBody = cleanBody.split(bookingUrl).reduce((accumulator, part, index, parts) => {
        if (index === parts.length - 1) return accumulator + part;
        if (seen) return accumulator + part;
        seen = true;
        return `${accumulator}${part}${bookingUrl}`;
      }, '');
    } else if (occurrences === 0) {
      cleanBody = `${cleanBody}\n\n${bookingUrl}`.trim();
    }
  }

  const fallbackSubject = organizationName
    ? `Quick intro — Peptides Costa Rica x ${organizationName}`.slice(0, 120)
    : 'Quick intro from Peptides Costa Rica';

  return {
    subject: channel === 'email' ? (clean(subject, 120) || fallbackSubject) : '',
    body: cleanBody,
  };
}

/**
 * Statuses a send must not overwrite.
 *
 * A follow-up to someone who already replied or booked would otherwise drag
 * them back to "contacted" and lose the most valuable thing the pipeline
 * knows about them.
 */
const TERMINAL_FOR_SEND = new Set(['responded', 'meeting_booked', 'partner', 'won', 'lost']);

export function prospectUpdatesForSend(currentStatus) {
  const updates = { last_contacted_at: new Date().toISOString() };
  if (!TERMINAL_FOR_SEND.has(currentStatus)) updates.status = 'contacted';
  return updates;
}

const CAL_TRIGGER_STATUS = {
  BOOKING_CREATED: 'booked',
  BOOKING_REQUESTED: 'booked',
  BOOKING_RESCHEDULED: 'rescheduled',
  BOOKING_CANCELLED: 'cancelled',
  BOOKING_REJECTED: 'cancelled',
};

export function calTriggerToStatus(triggerEvent) {
  return CAL_TRIGGER_STATUS[clean(triggerEvent, 60).toUpperCase()] || null;
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Flattens a Cal.com webhook into the row we store.
 *
 * The prospect token is looked for in every place Cal.com is willing to put a
 * custom value, because which one it uses depends on how the booking link was
 * built and we control only one of those paths.
 */
export function normalizeCalBooking(webhook) {
  const payload = webhook?.payload || {};
  const status = calTriggerToStatus(webhook?.triggerEvent);
  if (!status) return null;

  const providerEventId = clean(payload.uid || payload.bookingId || payload.id, 200);
  if (!providerEventId) return null;

  const attendee = (Array.isArray(payload.attendees) ? payload.attendees : [])[0] || {};
  const metadata = payload.metadata || {};
  const responses = payload.responses || {};
  const token = clean(
    metadata.prospectToken
      || metadata.prospect_token
      || responses.prospectToken?.value
      || responses.prospectToken
      || '',
    120,
  );

  return {
    status,
    providerEventId,
    prospectToken: token || null,
    title: clean(payload.title, 300) || null,
    startsAt: isoOrNull(payload.startTime),
    endsAt: isoOrNull(payload.endTime),
    attendeeName: clean(attendee.name, 200) || null,
    attendeeEmail: clean(attendee.email, 240).toLowerCase() || null,
    meetingUrl: clean(metadata.videoCallUrl || payload.location, 500) || null,
  };
}

/**
 * Booking moves a prospect forward; cancelling does not move it back.
 *
 * A cancelled meeting still means they engaged, and silently demoting them
 * would erase that from the pipeline. Reps re-stage manually instead.
 */
export function prospectUpdatesForBooking(booking, currentStatus) {
  if (booking.status === 'cancelled') return null;
  if (['won', 'partner', 'do_not_contact'].includes(currentStatus)) return null;
  return {
    status: 'meeting_booked',
    meeting_booked_at: booking.startsAt || new Date().toISOString(),
  };
}
