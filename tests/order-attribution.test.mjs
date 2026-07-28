import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid, sanitizeOrderAttribution } from '../src/lib/orderAttribution.mjs';

const CAMPAIGN_UUID = 'fc7d2815-51e6-40bf-b94b-3f65bab827ff';

test('isUuid accepts real campaign ids and rejects slugs', () => {
  assert.equal(isUuid(CAMPAIGN_UUID), true);
  assert.equal(isUuid('  ' + CAMPAIGN_UUID + ' '), true);
  // The two values that actually broke checkout in production.
  assert.equal(isUuid('tesa20_flash_sale'), false);
  assert.equal(isUuid('sean-mccully'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(12345), false);
});

test('a free-text campaign name is dropped so the order still saves', () => {
  const { order, dropped } = sanitizeOrderAttribution({
    order_number: 'WPCR-MS553NY5',
    customer_name: 'Taty Aguilar',
    campaign_id: 'tesa20_flash_sale',
    total_usd: 240,
  });

  assert.equal(order.campaign_id, null);
  assert.deepEqual(dropped, [{ field: 'campaign_id', value: 'tesa20_flash_sale' }]);
  // Everything that matters about the sale survives untouched.
  assert.equal(order.order_number, 'WPCR-MS553NY5');
  assert.equal(order.customer_name, 'Taty Aguilar');
  assert.equal(order.total_usd, 240);
});

test('a referral slug in the affiliate field is dropped too', () => {
  const { order, dropped } = sanitizeOrderAttribution({ affiliate_id: 'sean-mccully' });
  assert.equal(order.affiliate_id, null);
  assert.deepEqual(dropped.map((d) => d.field), ['affiliate_id']);
});

test('valid attribution is preserved exactly', () => {
  const { order, dropped } = sanitizeOrderAttribution({
    campaign_id: CAMPAIGN_UUID,
    journey_id: null,
    affiliate_id: undefined,
  });

  assert.equal(order.campaign_id, CAMPAIGN_UUID);
  assert.equal(order.journey_id, null);
  assert.equal(order.affiliate_id, undefined);
  assert.deepEqual(dropped, [], 'nothing valid should ever be discarded');
});

test('every uuid-typed attribution field is guarded', () => {
  const { order, dropped } = sanitizeOrderAttribution({
    campaign_id: 'slug-a',
    journey_id: 'slug-b',
    journey_enrollment_id: 'slug-c',
    journey_step_id: 'slug-d',
    affiliate_id: 'slug-e',
  });

  assert.deepEqual(dropped.map((d) => d.field).sort(), [
    'affiliate_id', 'campaign_id', 'journey_enrollment_id', 'journey_id', 'journey_step_id',
  ]);
  for (const value of Object.values(order)) assert.equal(value, null);
});

test('the original order object is not mutated', () => {
  const original = { campaign_id: 'tesa20_flash_sale' };
  sanitizeOrderAttribution(original);
  assert.equal(original.campaign_id, 'tesa20_flash_sale');
});

test('a missing or malformed payload is handled without throwing', () => {
  assert.deepEqual(sanitizeOrderAttribution(null), { order: null, dropped: [] });
  assert.deepEqual(sanitizeOrderAttribution(undefined), { order: undefined, dropped: [] });
});
