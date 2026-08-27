import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  buildBookingUrl,
  buildOutreachPrompt,
  calTriggerToStatus,
  canContactProspect,
  generateBookingToken,
  normalizeCalBooking,
  normalizeOutreachChannel,
  outreachDisclosure,
  parseDraftResponse,
  prospectUpdatesForBooking,
  prospectUpdatesForSend,
  prospectWhatsAppNumber,
  sanitizeOutreachDraft,
  whatsappHandoffUrl,
} from '../src/lib/prospectOutreach.mjs';

const outreachServer = await readFile(
  new URL('../src/lib/prospectOutreachServer.js', import.meta.url),
  'utf8',
);

const contactableProspect = {
  id: 'p1',
  organization_name: 'Gimnasio Escazú',
  status: 'qualified',
  contact_permission_status: 'business_contact',
  email_permission_status: 'business_contact',
  email_permission_basis: 'published_business_contact',
  email_permission_source_url: 'https://gimnasioescazu.test/contact',
  email_permission_evidence: 'Published mailto link',
  whatsapp_permission_status: 'business_contact',
  whatsapp_permission_basis: 'published_business_contact',
  whatsapp_permission_source_url: 'https://gimnasioescazu.test/contact',
  whatsapp_permission_evidence: 'Published WhatsApp link',
  email: 'Info@GimnasioEscazu.test',
  phone: '+506 2222 3333',
  whatsapp_numbers: ['+506 8888 7777'],
};

test('booking token creation uses an atomic claim and rereads the winner', () => {
  assert.match(outreachServer, /\.is\('booking_token', null\)/);
  assert.match(outreachServer, /\.select\('booking_token'\)/);
  assert.match(outreachServer, /if \(claimed\?\.booking_token\) return claimed\.booking_token/);
  assert.match(outreachServer, /if \(!current\?\.booking_token\)/);
});

test('refuses to contact a prospect whose channel permission is still unknown', () => {
  const result = canContactProspect({ ...contactableProspect, email_permission_status: 'unknown' }, 'email');
  assert.equal(result.allowed, false);
  assert.match(result.reason, /permission is still unknown/i);
  assert.equal(result.identity, null);
});

test('refuses do-not-contact regardless of which field carries it', () => {
  const byPermission = canContactProspect({ ...contactableProspect, contact_permission_status: 'do_not_contact' }, 'email');
  const byStatus = canContactProspect({ ...contactableProspect, status: 'do_not_contact' }, 'email');
  assert.equal(byPermission.allowed, false);
  assert.equal(byStatus.allowed, false);
  assert.match(byStatus.reason, /do not contact/i);

  const byChannel = canContactProspect({ ...contactableProspect, email_permission_status: 'do_not_contact' }, 'email');
  assert.equal(byChannel.allowed, false);
});

test('allows a published business contact and normalizes the identity', () => {
  const email = canContactProspect(contactableProspect, 'email');
  assert.equal(email.allowed, true);
  assert.equal(email.identity, 'info@gimnasioescazu.test');
  assert.equal(email.basis, 'published_business_contact');

  const whatsapp = canContactProspect(contactableProspect, 'whatsapp');
  assert.equal(whatsapp.allowed, true);
  assert.equal(whatsapp.identity, '50688887777');
});

test('permission for one channel never authorizes another channel', () => {
  const emailOnly = {
    ...contactableProspect,
    whatsapp_permission_status: 'unknown',
    whatsapp_permission_basis: null,
    whatsapp_permission_source_url: null,
  };
  assert.equal(canContactProspect(emailOnly, 'email').allowed, true);
  const whatsapp = canContactProspect(emailOnly, 'whatsapp');
  assert.equal(whatsapp.allowed, false);
  assert.match(whatsapp.reason, /WhatsApp permission is still unknown/i);
});

test('published-contact and consent permissions require their own evidence', () => {
  const missingSource = canContactProspect({
    ...contactableProspect,
    email_permission_source_url: null,
  }, 'email');
  assert.equal(missingSource.allowed, false);
  assert.match(missingSource.reason, /missing its source URL/i);

  const missingConsentEvidence = canContactProspect({
    ...contactableProspect,
    email_permission_status: 'consented',
    email_permission_basis: 'express_consent',
    email_permission_source_url: null,
    email_permission_evidence: null,
  }, 'email');
  assert.equal(missingConsentEvidence.allowed, false);
  assert.match(missingConsentEvidence.reason, /missing evidence/i);
});

test('outreach disclosure describes the evidence that actually authorized contact', () => {
  assert.match(outreachDisclosure({
    basis: 'published_business_contact',
    sourceUrl: 'https://www.gimnasioescazu.test/contact',
  }, 'email'), /at gimnasioescazu\.test/i);
  assert.match(outreachDisclosure({ basis: 'express_consent' }, 'email'), /gave permission for email contact/i);
});

test('blocks a channel the prospect has no address for', () => {
  const noEmail = canContactProspect({ ...contactableProspect, email: null }, 'email');
  assert.equal(noEmail.allowed, false);
  assert.match(noEmail.reason, /no valid work email/i);

  const noNumber = canContactProspect({ ...contactableProspect, phone: null, whatsapp_numbers: [] }, 'whatsapp');
  assert.equal(noNumber.allowed, false);
});

test('rejects malformed emails and unusable phone numbers', () => {
  assert.equal(canContactProspect({ ...contactableProspect, email: 'not-an-email' }, 'email').allowed, false);
  assert.equal(prospectWhatsAppNumber({ whatsapp_numbers: ['123'], phone: '456' }), null);
  assert.equal(prospectWhatsAppNumber({ whatsapp_numbers: [], phone: '+506 8888 7777' }), '50688887777');
});

test('normalizes only the two supported channels', () => {
  assert.equal(normalizeOutreachChannel('EMAIL'), 'email');
  assert.equal(normalizeOutreachChannel('whatsapp'), 'whatsapp');
  assert.equal(normalizeOutreachChannel('sms'), null);
  assert.equal(normalizeOutreachChannel(undefined), null);
});

test('booking url carries the prospect token through Cal.com metadata', () => {
  assert.equal(
    buildBookingUrl('https://cal.com/peptides/intro', 'pr_abc'),
    'https://cal.com/peptides/intro?metadata[prospectToken]=pr_abc',
  );
  assert.equal(
    buildBookingUrl('https://cal.com/peptides/intro?month=2026-08', 'pr_abc'),
    'https://cal.com/peptides/intro?month=2026-08&metadata[prospectToken]=pr_abc',
  );
  assert.equal(buildBookingUrl('', 'pr_abc'), null);
});

test('booking tokens are prefixed and contain no dashes to survive URLs', () => {
  const token = generateBookingToken(() => '3f1c9b2e-0000-4aaa-bbbb-ccccdddd1111');
  assert.equal(token, 'pr_3f1c9b2e00004aaabbbbccccdddd1111');
});

test('prompt carries the real business context and forbids invented claims', () => {
  const prompt = buildOutreachPrompt({
    ...contactableProspect,
    city: 'Escazú',
    country: 'Costa Rica',
    people: [{ full_name: 'Ana Rojas', job_title: 'Owner' }],
  }, { channel: 'email', bookingUrl: 'https://cal.com/x?metadata[prospectToken]=pr_1' });

  assert.match(prompt, /Gimnasio Escazú/);
  assert.match(prompt, /Ana Rojas/);
  assert.match(prompt, /Escazú, Costa Rica/);
  assert.match(prompt, /https:\/\/cal\.com\/x\?metadata\[prospectToken\]=pr_1/);
  assert.match(prompt, /Never make medical, dosage, therapeutic, or human-use claims/);
});

test('parses model JSON out of a fenced code block', () => {
  const parsed = parseDraftResponse('```json\n{"subject":"Hola","body":"Texto"}\n```');
  assert.deepEqual(parsed, { subject: 'Hola', body: 'Texto' });
});

test('falls back to treating an unparseable response as the body', () => {
  const parsed = parseDraftResponse('Just some prose with no JSON.');
  assert.equal(parsed.subject, '');
  assert.equal(parsed.body, 'Just some prose with no JSON.');
});

test('appends the booking link when the model drops it', () => {
  const draft = sanitizeOutreachDraft(
    { subject: 'Intro', body: 'Hola, quisiera coordinar una llamada.' },
    { channel: 'email', bookingUrl: 'https://cal.com/x' },
  );
  assert.equal(draft.body.split('https://cal.com/x').length - 1, 1);
  assert.ok(draft.body.endsWith('https://cal.com/x'));
});

test('collapses a repeated booking link down to one', () => {
  const draft = sanitizeOutreachDraft(
    { subject: 'Intro', body: 'Book here https://cal.com/x or here https://cal.com/x thanks' },
    { channel: 'email', bookingUrl: 'https://cal.com/x' },
  );
  assert.equal(draft.body.split('https://cal.com/x').length - 1, 1);
  assert.match(draft.body, /Book here https:\/\/cal\.com\/x or here {2}thanks/);
});

test('supplies a subject for email and never one for whatsapp', () => {
  const email = sanitizeOutreachDraft({ subject: '', body: 'Hola equipo, hablemos.' }, {
    channel: 'email', bookingUrl: 'https://cal.com/x', organizationName: 'Gimnasio Escazú',
  });
  assert.equal(email.subject, 'Quick intro — Peptides Costa Rica x Gimnasio Escazú');

  const whatsapp = sanitizeOutreachDraft({ subject: 'Ignored', body: 'Hola, hablemos.' }, {
    channel: 'whatsapp', bookingUrl: 'https://cal.com/x',
  });
  assert.equal(whatsapp.subject, '');
});

test('strips wrapping quotes the model likes to add', () => {
  const draft = sanitizeOutreachDraft({ subject: 'S', body: '"Hola, hablemos pronto."' }, { channel: 'email' });
  assert.equal(draft.body, 'Hola, hablemos pronto.');
});

test('whatsapp hand-off prefills the message for a human to send', () => {
  const url = whatsappHandoffUrl('+506 8888 7777', 'Hola Ana');
  assert.equal(url, 'https://wa.me/50688887777?text=Hola%20Ana');
  assert.equal(whatsappHandoffUrl('', 'Hola'), null);
});

test('a send never demotes a prospect who already replied or booked', () => {
  assert.equal(prospectUpdatesForSend('qualified').status, 'contacted');
  assert.equal(prospectUpdatesForSend('discovered').status, 'contacted');
  assert.equal(prospectUpdatesForSend('responded').status, undefined);
  assert.equal(prospectUpdatesForSend('meeting_booked').status, undefined);
  assert.equal(prospectUpdatesForSend('won').status, undefined);
  assert.ok(prospectUpdatesForSend('responded').last_contacted_at);
});

test('maps Cal.com triggers to meeting statuses and ignores the rest', () => {
  assert.equal(calTriggerToStatus('BOOKING_CREATED'), 'booked');
  assert.equal(calTriggerToStatus('BOOKING_RESCHEDULED'), 'rescheduled');
  assert.equal(calTriggerToStatus('BOOKING_CANCELLED'), 'cancelled');
  assert.equal(calTriggerToStatus('MEETING_ENDED'), null);
  assert.equal(calTriggerToStatus(''), null);
});

test('normalizes a Cal.com booking webhook into a storable row', () => {
  const booking = normalizeCalBooking({
    triggerEvent: 'BOOKING_CREATED',
    payload: {
      uid: 'bk_123',
      title: '15 min intro',
      startTime: '2026-08-20T15:00:00.000Z',
      endTime: '2026-08-20T15:15:00.000Z',
      attendees: [{ name: 'Ana Rojas', email: 'Ana@GimnasioEscazu.test' }],
      metadata: { prospectToken: 'pr_abc', videoCallUrl: 'https://meet.test/xyz' },
    },
  });

  assert.equal(booking.status, 'booked');
  assert.equal(booking.providerEventId, 'bk_123');
  assert.equal(booking.prospectToken, 'pr_abc');
  assert.equal(booking.attendeeEmail, 'ana@gimnasioescazu.test');
  assert.equal(booking.startsAt, '2026-08-20T15:00:00.000Z');
  assert.equal(booking.meetingUrl, 'https://meet.test/xyz');
});

test('reads the prospect token from a booking form response as well as metadata', () => {
  const booking = normalizeCalBooking({
    triggerEvent: 'BOOKING_CREATED',
    payload: { uid: 'bk_9', responses: { prospectToken: { value: 'pr_from_form' } }, attendees: [] },
  });
  assert.equal(booking.prospectToken, 'pr_from_form');
});

test('drops webhooks with no usable trigger or booking id', () => {
  assert.equal(normalizeCalBooking({ triggerEvent: 'MEETING_ENDED', payload: { uid: 'bk_1' } }), null);
  assert.equal(normalizeCalBooking({ triggerEvent: 'BOOKING_CREATED', payload: {} }), null);
  assert.equal(normalizeCalBooking(null), null);
});

test('tolerates a malformed start time rather than storing garbage', () => {
  const booking = normalizeCalBooking({
    triggerEvent: 'BOOKING_CREATED',
    payload: { uid: 'bk_2', startTime: 'not-a-date', attendees: [] },
  });
  assert.equal(booking.startsAt, null);
});

test('a booking advances the pipeline but a cancellation never rewinds it', () => {
  const booked = prospectUpdatesForBooking({ status: 'booked', startsAt: '2026-08-20T15:00:00.000Z' }, 'contacted');
  assert.equal(booked.status, 'meeting_booked');
  assert.equal(booked.meeting_booked_at, '2026-08-20T15:00:00.000Z');

  assert.equal(prospectUpdatesForBooking({ status: 'cancelled' }, 'meeting_booked'), null);
  assert.equal(prospectUpdatesForBooking({ status: 'booked' }, 'won'), null);
  assert.equal(prospectUpdatesForBooking({ status: 'booked' }, 'do_not_contact'), null);
});
