import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getInboundWhatsAppChannel,
  normalizePhoneNumberId,
  validateManualWhatsAppChannel,
  whatsappChannelLabel,
} from '../src/lib/whatsappChannels.mjs';

test('extracts the receiving WhatsApp business number from a Meta webhook', () => {
  assert.deepEqual(getInboundWhatsAppChannel({
    metadata: {
      display_phone_number: '506 8404-6973',
      phone_number_id: '123456789012345',
    },
  }, { id: 'waba-123' }), {
    phoneNumberId: '123456789012345',
    displayPhoneNumber: '506 8404-6973',
    wabaId: 'waba-123',
    source: 'cloud_api',
  });
});

test('rejects webhook channel metadata without a receiving phone number id', () => {
  assert.equal(getInboundWhatsAppChannel({ metadata: {} }), null);
  assert.equal(getInboundWhatsAppChannel({}), null);
});

test('normalizes Meta phone number ids without allowing URL path characters', () => {
  assert.equal(normalizePhoneNumberId(' 12345/../../messages '), '12345messages');
  assert.equal(normalizePhoneNumberId('phone_id-01'), 'phone_id-01');
});

test('channel labels prefer the configured friendly name', () => {
  assert.equal(whatsappChannelLabel({ name: 'Sales CR', display_phone_number: '+506 8404 6973' }), 'Sales CR');
  assert.equal(whatsappChannelLabel({ display_phone_number: '+506 8404 6973' }), '+506 8404 6973');
  assert.equal(whatsappChannelLabel({ phone_number_id: '1234567890' }), 'WhatsApp 7890');
});

test('manual number setup requires the Meta phone number id, not a formatted phone', () => {
  assert.equal(validateManualWhatsAppChannel({
    name: 'Sales CR',
    phoneNumberId: '+506 8404-6973',
  }).error, 'Enter the numeric Phone Number ID from Meta, not the visible WhatsApp number.');

  assert.deepEqual(validateManualWhatsAppChannel({
    name: ' Sales CR ',
    displayPhoneNumber: '+506 8404-6973',
    phoneNumberId: '123456789012345',
    wabaId: '987654321098765',
  }), {
    value: {
      name: 'Sales CR',
      displayPhoneNumber: '+506 8404-6973',
      phoneNumberId: '123456789012345',
      wabaId: '987654321098765',
    },
  });
});

test('manual number setup rejects malformed visible and WABA numbers', () => {
  assert.match(validateManualWhatsAppChannel({
    name: 'Sales',
    phoneNumberId: '1234567890',
    wabaId: 'not-an-id',
  }).error, /Business Account ID/);
  assert.match(validateManualWhatsAppChannel({
    name: 'Sales',
    phoneNumberId: '1234567890',
    displayPhoneNumber: '123',
  }).error, /valid visible WhatsApp number/);
});
