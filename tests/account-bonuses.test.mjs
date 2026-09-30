import test from 'node:test';
import assert from 'node:assert/strict';

import { canDeleteCustomerAccount, describeOrderBonuses } from '../src/lib/accountBonuses.mjs';

test('an order lists the deal, the code, and the saving', () => {
  const lines = describeOrderBonuses({
    promo_code: 'COSTA10',
    volume_discount_pct: 0,
    currency: 'USD',
    discount_amount_usd: 12.5,
    discount_amount_crc: 0,
  }, { dealTitle: 'Flash sale', lang: 'en' });

  assert.deepEqual(lines, ['Flash sale', 'Promo code COSTA10', 'Saving $12.50']);
});

test('a volume saving is named, and a plain order has nothing to show', () => {
  assert.deepEqual(describeOrderBonuses({ volume_discount_pct: 15, currency: 'CRC', discount_amount_crc: 0 }, { lang: 'es' }), [
    'Ahorro por volumen 15%',
  ]);
  assert.deepEqual(describeOrderBonuses({ promo_code: '', volume_discount_pct: 0 }), []);
});

test('a staff login cannot be deleted as a customer account', () => {
  assert.equal(canDeleteCustomerAccount({ userId: 'customer-1', staffUserIds: ['staff-1'] }), true);
  assert.equal(canDeleteCustomerAccount({ userId: 'staff-1', staffUserIds: ['staff-1'] }), false);
  assert.equal(canDeleteCustomerAccount({ userId: '' }), false);
});
