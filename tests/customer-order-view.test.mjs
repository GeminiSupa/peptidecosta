import test from 'node:test';
import assert from 'node:assert/strict';

import {
  billableItemCount,
  deliveryLabel,
  formatItemPrice,
  formatOrderTotal,
  orderDeliveryState,
  orderItems,
  orderPaymentState,
  paymentLabel,
} from '../src/lib/customerOrderView.mjs';

test('card payment states read as pending, not as internal jargon', () => {
  for (const status of ['Pending', 'Payment Pending', 'Pending - Card', 'Pending - Card 3DS']) {
    assert.equal(orderPaymentState({ status }), 'pending');
  }
  assert.equal(paymentLabel({ status: 'Pending - Card 3DS' }, 'en'), 'Payment pending');
  assert.equal(paymentLabel({ status: 'Pending - Card 3DS' }, 'es'), 'Pago pendiente');
});

test('settled orders read as paid whatever stage they reached', () => {
  for (const status of ['Paid', 'Processing', 'Order Complete', 'Completed']) {
    assert.equal(orderPaymentState({ status }), 'paid');
  }
});

test('declined and errored payments are distinguished from cancellations', () => {
  assert.equal(orderPaymentState({ status: 'Declined' }), 'failed');
  assert.equal(orderPaymentState({ status: 'Error' }), 'failed');
  assert.equal(orderPaymentState({ status: 'Cancelled' }), 'cancelled');
});

test('a tracking number means shipped even while the status still says paid', () => {
  assert.equal(orderDeliveryState({ status: 'Paid', tracking_number: 'CR123456789' }), 'shipped');
  assert.equal(orderDeliveryState({ status: 'Paid' }), 'preparing');
  assert.equal(orderDeliveryState({ status: 'Processing' }), 'preparing');
  assert.equal(orderDeliveryState({ status: 'Pending' }), 'awaiting_payment');
});

test('a completed order reads as delivered regardless of tracking', () => {
  assert.equal(orderDeliveryState({ status: 'Order Complete' }), 'delivered');
  assert.equal(orderDeliveryState({ status: 'Order Complete', tracking_number: 'X1' }), 'delivered');
  assert.equal(deliveryLabel({ status: 'Order Complete' }, 'es'), 'Entregado');
});

test('a cancelled order is never shown as in transit', () => {
  assert.equal(orderDeliveryState({ status: 'Cancelled', tracking_number: 'CR999' }), 'cancelled');
});

test('the total is shown in the currency actually charged', () => {
  assert.equal(formatOrderTotal({ currency: 'USD', total_usd: 135, total_crc: 61355 }), '$135.00');
  assert.equal(formatOrderTotal({ currency: 'CRC', total_usd: 135, total_crc: 61355 }), '₡61,355');
  // Missing currency follows the storefront default rather than guessing USD.
  assert.equal(formatOrderTotal({ total_crc: 2500 }), '₡2,500');
  assert.equal(formatOrderTotal({ currency: 'USD', total_usd: null }), '—');
});

test('a free gift line shows no price rather than a zero', () => {
  assert.equal(formatItemPrice(0, 'USD'), '—');
  assert.equal(formatItemPrice(10, 'USD'), '$10.00');
  assert.equal(formatItemPrice(4500, 'CRC'), '₡4,500');
});

test('items survive being stored as JSON text on older rows', () => {
  // A syringe earns no free vial, so these read back exactly as stored.
  const syringe = { product: 'Insulin Syringe 1ml', qty: 1 };
  assert.deepEqual(orderItems({ items: [syringe] }), [syringe]);
  assert.deepEqual(orderItems({ items: '[{"product":"Insulin Syringe 1ml","qty":1}]' }), [syringe]);
  assert.deepEqual(orderItems({ items: 'not json' }), []);
  assert.deepEqual(orderItems({}), []);
});

test('an old order shows the free vials it shipped with', () => {
  // Nothing was written to the row; the box still had them in it.
  const items = orderItems({ items: [{ product: 'Semaglutide 5mg', qty: 2, price: 100 }] }, 'en');

  assert.equal(items.length, 2);
  assert.equal(items[1].product, 'Bacteriostatic Water 3ml (Free Gift)');
  assert.equal(items[1].qty, 2);
  assert.equal(items[1].price, 0);
});

test('the gift is listed in the customer\'s own language', () => {
  const es = orderItems({ items: [{ product: 'Semaglutide 5mg', qty: 1, price: 100 }] }, 'es');
  assert.equal(es[1].product, 'Agua Bacteriostática 3ml (Regalo)');
});

test('an order already carrying its gift is not given a second one', () => {
  const items = orderItems({
    items: [
      { product: 'Semaglutide 5mg', qty: 1, price: 100 },
      { product: 'Agua Bacteriostática 3ml (Regalo)', qty: 1, price: 0 },
    ],
  }, 'es');

  assert.equal(items.length, 2);
});

test('free vials are shown but never counted', () => {
  // The count is what the customer chose and paid for. Counting a gift they
  // never added would change the number every past order has always shown.
  const items = orderItems({ items: [{ product: 'Semaglutide 5mg', qty: 2, price: 100 }] }, 'en');

  assert.equal(items.length, 2);
  assert.equal(billableItemCount(items), 1);
});

test('the count holds up on carts that earn no gift', () => {
  assert.equal(billableItemCount([]), 0);
  assert.equal(billableItemCount(), 0);
  assert.equal(
    billableItemCount([{ product: 'BAC Water 3ml', qty: 5, price: 10 }]),
    1,
  );
  // An untagged zero-priced vial on a pre-suffix order is still a gift.
  assert.equal(
    billableItemCount([
      { product: 'Semaglutide 5mg', qty: 1, price: 100 },
      { product: 'BAC Water 3ml', qty: 1, price: 0 },
    ]),
    1,
  );
});
