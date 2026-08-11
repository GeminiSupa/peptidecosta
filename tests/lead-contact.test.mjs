import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leadContactPoints,
  leadEmail,
  leadName,
  leadPhone,
} from '../src/lib/leadContact.mjs';

// The exact shape live chat writes today: one contact point in the column, the
// rest stranded in the notes blob. This is the lead Joe reported.
const chatLead = {
  contact_method: 'email',
  contact_value: 'aljiracr@gmail.com',
  notes: 'Lead captured from website live chat.\nName: Alex Jimenez\nEmail: aljiracr@gmail.com\nPhone: +506 70195752\nFirst message: h',
};

test('recovers the name, email and phone a chat lead only kept in notes', () => {
  assert.equal(leadName(chatLead), 'Alex Jimenez');
  assert.equal(leadEmail(chatLead), 'aljiracr@gmail.com');
  assert.equal(leadPhone(chatLead), '50670195752');
});

test('real columns win over anything parsed out of notes', () => {
  const lead = { ...chatLead, name: 'Alex J', email: 'new@example.com', phone: '50688887777' };
  assert.equal(leadName(lead), 'Alex J');
  assert.equal(leadEmail(lead), 'new@example.com');
  assert.equal(leadPhone(lead), '50688887777');
});

test('a phone-only lead reports no email, and vice versa', () => {
  const phoneOnly = { contact_method: 'whatsapp', contact_value: '50670195752' };
  assert.equal(leadEmail(phoneOnly), '');
  assert.equal(leadPhone(phoneOnly), '50670195752');
  assert.equal(leadName(phoneOnly), '');

  const emailOnly = { contact_method: 'email', contact_value: 'ana@example.com' };
  assert.equal(leadEmail(emailOnly), 'ana@example.com');
  assert.equal(leadPhone(emailOnly), '');
});

test('never mistakes an email for a phone number', () => {
  assert.equal(leadPhone({ contact_value: 'user123456789@example.com' }), '');
});

test('ignores fragments too short to be a phone number', () => {
  assert.equal(leadPhone({ contact_value: '12345' }), '');
  assert.equal(leadPhone({ notes: 'Phone: 4321' }), '');
});

test('flags which contact point the row already shows as its headline', () => {
  const fromEmail = leadContactPoints(chatLead);
  assert.equal(fromEmail.emailIsPrimary, true);
  assert.equal(fromEmail.phoneIsPrimary, false);

  const fromPhone = leadContactPoints({ contact_value: '50670195752', notes: chatLead.notes });
  assert.equal(fromPhone.phoneIsPrimary, true);
  assert.equal(fromPhone.emailIsPrimary, false);
});

test('survives a lead with nothing on it', () => {
  assert.deepEqual(leadContactPoints({}), {
    name: '', email: '', phone: '', emailIsPrimary: false, phoneIsPrimary: false,
  });
  assert.deepEqual(leadContactPoints(null), {
    name: '', email: '', phone: '', emailIsPrimary: false, phoneIsPrimary: false,
  });
});
