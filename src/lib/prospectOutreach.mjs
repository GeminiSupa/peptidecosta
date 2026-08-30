/**
 * 1:1 prospect outreach: who may be contacted, what the AI is asked to write,
 * and how a Cal.com booking finds its way back to the prospect it came from.
 *
 * Everything here is pure so the rules that decide whether a cold message may
 * be sent can be tested without SMTP, Meta, or a database.
 */

import { channelPermissionFor } from './prospectPermissions.mjs';
import { whatsappDialableNumber } from './prospectPhone.mjs';

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

/**
 * The number to open WhatsApp with, in the form wa.me reads.
 *
 * The prospect's country completes a number the business published in national
 * form; see whatsappDialableNumber. A candidate that cannot be dialed
 * internationally is skipped rather than handed over half-formed, because the
 * link would open a chat with a country code nobody owns.
 */
export function prospectWhatsAppNumber(prospect = {}) {
  const candidates = [...(prospect.whatsapp_numbers || []), prospect.phone];
  for (const candidate of candidates) {
    const dialable = whatsappDialableNumber(candidate, prospect.country);
    if (dialable) return dialable;
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

  const permission = channelPermissionFor(prospect, normalizedChannel);
  if (prospect.contact_permission_status === 'do_not_contact' || prospect.status === 'do_not_contact') {
    return { allowed: false, reason: 'This prospect is marked do not contact.', identity: null, basis: null };
  }
  if (permission.status === 'do_not_contact') {
    return { allowed: false, reason: `This prospect is marked do not contact by ${normalizedChannel}.`, identity: null, basis: null };
  }
  if (!CONTACTABLE_PERMISSIONS.has(permission.status)) {
    return {
      allowed: false,
      reason: `${normalizedChannel === 'email' ? 'Email' : 'WhatsApp'} permission is still unknown. Verify evidence for this channel before drafting or sending.`,
      identity: null,
      basis: null,
    };
  }
  if (permission.status === 'business_contact'
    && (permission.basis !== 'published_business_contact' || !permission.sourceUrl)) {
    return {
      allowed: false,
      reason: `The published ${normalizedChannel} contact is missing its source URL. Verify the channel evidence again.`,
      identity: null,
      basis: null,
    };
  }
  if (permission.status === 'consented'
    && (permission.basis !== 'express_consent' || (!permission.sourceUrl && !permission.evidence))) {
    return {
      allowed: false,
      reason: `${normalizedChannel === 'email' ? 'Email' : 'WhatsApp'} consent is missing evidence. Record where or how consent was received.`,
      identity: null,
      basis: null,
    };
  }

  if (normalizedChannel === 'email') {
    const email = clean(prospect.email, 240).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      return { allowed: false, reason: 'No valid work email saved for this prospect.', identity: null, basis: null };
    }
    return {
      allowed: true,
      reason: '',
      identity: email,
      basis: permission.basis,
      permissionStatus: permission.status,
      sourceUrl: permission.sourceUrl,
      evidence: permission.evidence,
    };
  }

  const number = prospectWhatsAppNumber(prospect);
  if (!number) {
    return {
      allowed: false,
      reason: 'No dialable WhatsApp number saved for this prospect. Add the country code, or the country, so the number can be dialed internationally.',
      identity: null,
      basis: null,
    };
  }
  return {
    allowed: true,
    reason: '',
    identity: number,
    basis: permission.basis,
    permissionStatus: permission.status,
    sourceUrl: permission.sourceUrl,
    evidence: permission.evidence,
  };
}

export function outreachDisclosure(permission = {}, channel = 'email') {
  const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'email';
  if (permission.basis === 'express_consent') {
    return `You received this because your business gave permission for ${channelLabel} contact. Reply "remove" and we will not contact you again.`;
  }
  if (permission.basis === 'published_business_contact' && permission.sourceUrl) {
    let source = 'your public business website';
    try {
      source = new URL(permission.sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      // canContactProspect already requires a normalized URL; retain safe copy.
    }
    return `You received this because this ${channelLabel} contact was published as a business contact at ${source}. Reply "remove" and we will not contact you again.`;
  }
  return `You received this based on recorded ${channelLabel} permission. Reply "remove" and we will not contact you again.`;
}

export const WHATSAPP_MESSAGE_LIMIT = 1500;

/**
 * WhatsApp's first touch is a human hand-off, not an automated send.
 *
 * The Cloud API only accepts free-form messages inside a 24-hour window opened
 * by the recipient, and cold outreach has no such window. Sending anyway means
 * a rejected call at best and a flagged business number at worst. So the draft
 * is handed to the rep as a prefilled wa.me link: same words, same logging,
 * but a person presses send and the number stays healthy.
 *
 * The disclosure is passed separately rather than pre-joined by the caller, so
 * that a long body is what gives way when the link has to be trimmed.
 */
export function whatsappHandoffUrl(number, body, disclosure = '') {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return null;
  // The disclosure carries the opt-out, so it is the part that must survive.
  // Appending it and clamping the whole string cut it off whenever the rep
  // edited the draft past ~1350 characters — the send route allows 4000 — and
  // the message went out with no way to unsubscribe from it.
  const tail = disclosure ? `\n\n\u2014\n${clean(disclosure, WHATSAPP_MESSAGE_LIMIT)}` : '';
  const room = Math.max(0, WHATSAPP_MESSAGE_LIMIT - tail.length);
  return `https://wa.me/${digits}?text=${encodeURIComponent(`${clean(body, room)}${tail}`)}`;
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

export function buildOutreachPrompt(prospect, {
  channel,
  bookingUrl,
  language = 'auto',
  permission = null,
} = {}) {
  const isEmail = channel === 'email';
  const decisionMaker = (prospect.people || []).find((person) => person?.full_name);
  const languageRule = language === 'es'
    ? 'Write in Spanish.'
    : language === 'en'
      ? 'Write in English.'
      : 'Write in the language the business most likely uses day to day, inferred from its country and website. Default to Spanish for Costa Rica and the rest of Latin America, English elsewhere.';
  const contactBasisRule = permission?.basis === 'express_consent'
    ? 'State plainly that you are following up using the contact permission the business provided. Do not claim the address came from a public listing.'
    : 'State plainly that the contact details were found on the business\'s public website. Do not claim prior consent.';

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
- ${contactBasisRule}

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
