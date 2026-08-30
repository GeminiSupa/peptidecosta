import test from 'node:test';
import assert from 'node:assert/strict';

import { prospectDialPlan, whatsappDialableNumber } from '../src/lib/prospectPhone.mjs';
import { canContactProspect, whatsappHandoffUrl, outreachDisclosure, WHATSAPP_MESSAGE_LIMIT } from '../src/lib/prospectOutreach.mjs';
import { prospectContactReadiness } from '../src/lib/prospectReadiness.mjs';
import { hasUsableProspectWhatsAppIdentity } from '../src/lib/prospects.mjs';

const verified = {
  organization_name: 'Gimnasio Olimpo',
  country: 'Costa Rica',
  whatsapp_permission_status: 'business_contact',
  whatsapp_permission_basis: 'published_business_contact',
  whatsapp_permission_source_url: 'https://gimnasio.cr/contacto',
};

test('a national number is completed with the country dial code', () => {
  // tel:88887777 is how Costa Rican sites publish a number. Sent to wa.me as
  // published it reads as country code +888, which belongs to nobody.
  assert.equal(whatsappDialableNumber('88887777', 'Costa Rica'), '50688887777');
  assert.equal(whatsappDialableNumber('8888 7777', 'CR'), '50688887777');
});

test('a number that already carries its country code is left alone', () => {
  assert.equal(whatsappDialableNumber('+506 8888 7777', 'Costa Rica'), '50688887777');
  assert.equal(whatsappDialableNumber('50688887777', 'Costa Rica'), '50688887777');
});

test('a foreign number on a local business page keeps its own country code', () => {
  assert.equal(whatsappDialableNumber('+1 212 555 1234', 'Costa Rica'), '12125551234');
});

test('a number that cannot be dialed anywhere is refused', () => {
  // Ten digits, no country code, and not the national length for Costa Rica.
  assert.equal(whatsappDialableNumber('2222333444', 'Costa Rica'), null);
  assert.equal(whatsappDialableNumber('123', 'Costa Rica'), null);
});

test('an unknown country passes the number through rather than dropping the lead', () => {
  assert.equal(whatsappDialableNumber('88887777', undefined), '88887777');
  assert.equal(whatsappDialableNumber('+55 11 98765 4321', 'Brazil'), '5511987654321');
});

test('country names resolve in either language, and by ISO code', () => {
  assert.equal(prospectDialPlan('Costa Rica')?.dial, '506');
  assert.equal(prospectDialPlan('España')?.dial, '34');
  assert.equal(prospectDialPlan('Spain')?.dial, '34');
  assert.equal(prospectDialPlan('MX')?.dial, '52');
  assert.equal(prospectDialPlan('Atlantis'), null);
  assert.equal(prospectDialPlan(''), null);
});

test('the send gate hands wa.me a dialable number', () => {
  const permission = canContactProspect({ ...verified, phone: '88887777' }, 'whatsapp');
  assert.equal(permission.allowed, true);
  assert.equal(permission.identity, '50688887777');
  assert.match(whatsappHandoffUrl(permission.identity, 'Hola'), /^https:\/\/wa\.me\/50688887777\?/);
});

test('readiness stops advertising a number the send gate could not dial', () => {
  const readiness = prospectContactReadiness({ ...verified, phone: '2222333444' });
  assert.equal(readiness.channels.whatsapp.status, 'needs_verification');
  assert.match(readiness.channels.whatsapp.reason, /dialable/i);
});

test('permission cannot be verified against an undialable number', () => {
  assert.equal(hasUsableProspectWhatsAppIdentity({ country: 'Costa Rica', phone: '88887777' }), true);
  assert.equal(hasUsableProspectWhatsAppIdentity({ country: 'Costa Rica', phone: '2222333444' }), false);
});

test('a long WhatsApp body is trimmed but the opt-out disclosure survives', () => {
  // The send route accepts 4,000 characters and the rep can edit the draft
  // freely, so the message can outgrow the link. The disclosure carries the
  // opt-out and must never be the part that falls off.
  const disclosure = outreachDisclosure(
    { basis: 'published_business_contact', sourceUrl: 'https://gimnasio.cr/contacto' },
    'whatsapp',
  );
  const url = whatsappHandoffUrl('50688887777', 'A'.repeat(3000), disclosure);
  const text = decodeURIComponent(url.split('?text=')[1]);
  assert.equal(text.length, WHATSAPP_MESSAGE_LIMIT);
  assert.ok(text.endsWith(disclosure));
  assert.ok(text.startsWith('AAA'));
});

test('a short message is untouched apart from the appended disclosure', () => {
  const url = whatsappHandoffUrl('50688887777', 'Hola Ana', 'Reply remove to opt out.');
  const text = decodeURIComponent(url.split('?text=')[1]);
  assert.equal(text, 'Hola Ana\n\n—\nReply remove to opt out.');
});
