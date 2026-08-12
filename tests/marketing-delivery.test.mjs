import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySmtpFailure,
  canRetryDelivery,
  isMarketingSuppressed,
  mapProviderDeliveryStatus,
  normalizeMarketingIdentity,
  shouldSuppressForDeliveryStatus,
} from '../src/lib/marketingDelivery.mjs';

test('normalizes email and phone identities consistently', () => {
  assert.equal(normalizeMarketingIdentity('  Person@Example.COM ', 'email'), 'person@example.com');
  assert.equal(normalizeMarketingIdentity('+506 8888-7777', 'whatsapp'), '50688887777');
});

test('checks channel and all-channel suppressions', () => {
  const suppressions = new Set(['person@example.com:email', '50688887777:all']);
  assert.equal(isMarketingSuppressed(suppressions, 'PERSON@example.com', 'email'), true);
  assert.equal(isMarketingSuppressed(suppressions, '+506 8888-7777', 'whatsapp'), true);
  assert.equal(isMarketingSuppressed(suppressions, 'other@example.com', 'email'), false);
});

test('prevents retries after terminal status or attempt limit', () => {
  assert.equal(canRetryDelivery(null), true);
  assert.equal(canRetryDelivery({ status: 'failed', attempt_count: 2 }), true);
  assert.equal(canRetryDelivery({ status: 'failed', attempt_count: 3 }), false);
  assert.equal(canRetryDelivery({ status: 'delivered', attempt_count: 1 }), false);
  assert.equal(canRetryDelivery({ status: 'complained', attempt_count: 1 }), false);
});

test('normalizes common provider event names', () => {
  assert.equal(mapProviderDeliveryStatus('hard_bounce'), 'bounced');
  assert.equal(mapProviderDeliveryStatus('spam_complaint'), 'complained');
  assert.equal(mapProviderDeliveryStatus('deferred'), 'failed');
  assert.equal(mapProviderDeliveryStatus('unknown'), null);
});

test('hard failures require suppression', () => {
  assert.equal(shouldSuppressForDeliveryStatus('bounced'), true);
  assert.equal(shouldSuppressForDeliveryStatus('complained'), true);
  assert.equal(shouldSuppressForDeliveryStatus('failed'), false);
});

test('retires an address only when the server says the mailbox is dead', () => {
  assert.equal(classifySmtpFailure({ responseCode: 550, response: '550 5.1.1 <a@b.com>: Recipient address rejected: User unknown' }), 'hard');
  assert.equal(classifySmtpFailure({ responseCode: 550, response: '550 No such user here' }), 'hard');
  assert.equal(classifySmtpFailure({ responseCode: 553, response: '553 mailbox not found' }), 'hard');
  assert.equal(classifySmtpFailure({ responseCode: 550, response: '550 5.1.2 Domain not found' }), 'hard');
});

test('never blames the recipient for our own sending problems', () => {
  assert.equal(classifySmtpFailure({ responseCode: 550, response: '550 Message rejected as spam' }), 'soft');
  assert.equal(classifySmtpFailure({ responseCode: 550, response: '550 5.7.1 Relaying denied' }), 'soft');
  assert.equal(classifySmtpFailure({ responseCode: 535, response: '535 Authentication failed' }), 'soft');
  assert.equal(classifySmtpFailure({ responseCode: 550, response: '550 Sender address does not exist' }), 'soft');
  assert.equal(classifySmtpFailure({ responseCode: 550, response: '550 Daily sending quota exceeded' }), 'soft');
  assert.equal(classifySmtpFailure({ responseCode: 550, response: '550 IP on blocklist' }), 'soft');
});

test('treats transient failures and unrecognised errors as retryable', () => {
  assert.equal(classifySmtpFailure({ responseCode: 451, response: '451 Temporary local problem' }), 'soft');
  assert.equal(classifySmtpFailure({ responseCode: 421, response: '421 Service not available' }), 'soft');
  assert.equal(classifySmtpFailure({ code: 'ETIMEDOUT', message: 'Connection timed out' }), 'soft');
  assert.equal(classifySmtpFailure(new Error('socket hang up')), 'soft');
  assert.equal(classifySmtpFailure(null), 'soft');
  assert.equal(classifySmtpFailure({ responseCode: 550, response: '550 Command rejected' }), 'soft');
});
