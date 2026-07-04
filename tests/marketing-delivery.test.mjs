import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
