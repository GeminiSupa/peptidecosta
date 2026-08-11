import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPaidOrderIndex,
  getAbandonedCartConversion,
  getLeadConversion,
  leadIsActiveForPipeline,
} from '../src/lib/leadConversion.mjs';

test('does not convert leads with invalid or blank phone values', () => {
  const orders = [
    { id: 'order-1', status: 'Paid', customer_phone: '+506 8888-7777' },
  ];

  assert.equal(getLeadConversion({ contact_value: 'wendy' }, orders).converted, false);
  assert.equal(getLeadConversion({ contact_value: '' }, orders).converted, false);
  assert.equal(getLeadConversion({ contact_value: null, phone: '123' }, orders).converted, false);
});

test('requires the matched order to be paid', () => {
  const lead = { contact_value: '+506 8888-7777' };
  const orders = [
    { id: 'pending-order', status: 'Payment Pending', customer_phone: '+506 8888-7777' },
    { id: 'not-paid-order', status: 'Not Paid', customer_phone: '+506 8888-7777' },
  ];

  assert.equal(getLeadConversion(lead, orders).converted, false);
});

test('matches paid orders by phone tail across local and country formats', () => {
  const lead = { contact_value: '8888-7777' };
  const orders = [
    { id: 'order-1', order_number: 'WPPCR-123', status: 'paid', customer_phone: '+506 8888-7777' },
  ];

  const result = getLeadConversion(lead, orders);
  assert.equal(result.converted, true);
  assert.equal(result.order.order_number, 'WPPCR-123');
});

test('matches paid orders by normalized email', () => {
  const lead = { contact_value: ' PERSON@example.COM ' };
  const orders = [
    { id: 'order-1', status: 'Completed', customer_email: 'person@example.com' },
  ];

  assert.equal(getLeadConversion(lead, orders).converted, true);
});

test('converted leads are not active pipeline leads', () => {
  const lead = { contact_value: 'person@example.com' };
  const orders = [
    { id: 'order-1', status: 'Paid', customer_email: 'person@example.com' },
  ];

  assert.equal(leadIsActiveForPipeline(lead, orders), false);
  assert.equal(leadIsActiveForPipeline({ contact_value: 'new@example.com' }, orders), true);
});

test('converts abandoned carts when a paid order matches the cart contact', () => {
  const cart = {
    created_at: '2026-07-20T12:00:00.000Z',
    customer_email: ' PERSON@example.COM ',
    customer_phone: '8888-7777',
  };
  const orders = [
    {
      id: 'order-1',
      status: 'Paid',
      created_at: '2026-07-20T12:20:00.000Z',
      customer_email: 'person@example.com',
    },
  ];

  const result = getAbandonedCartConversion(cart, orders);
  assert.equal(result.converted, true);
  assert.equal(result.order.id, 'order-1');
});

test('does not hide newer abandoned carts because of older paid orders', () => {
  const cart = {
    created_at: '2026-07-20T12:00:00.000Z',
    customer_phone: '+506 8888-7777',
  };
  const orders = [
    {
      id: 'older-order',
      status: 'Completed',
      created_at: '2026-07-20T08:00:00.000Z',
      customer_phone: '8888-7777',
    },
  ];

  assert.equal(getAbandonedCartConversion(cart, orders).converted, false);
});

test('can ignore cart timing for recovery safety checks', () => {
  const cart = {
    created_at: '2026-07-20T12:00:00.000Z',
    customer_phone: '+506 8888-7777',
  };
  const orders = [
    {
      id: 'older-order',
      status: 'Paid',
      created_at: '2026-07-20T08:00:00.000Z',
      customer_phone: '8888-7777',
    },
  ];

  assert.equal(getAbandonedCartConversion(cart, orders, { ignoreTiming: true }).converted, true);
});

test('a prebuilt paid-order index matches a raw orders array exactly', () => {
  const orders = [
    { id: 'unpaid', status: 'Pending', customer_email: 'ana@example.com' },
    { id: 'paid-phone', status: 'Paid', customer_phone: '+506 8888-7777' },
    { id: 'paid-email', status: 'Order Complete', customer_email: 'Ana@Example.com' },
  ];
  const index = createPaidOrderIndex(orders);

  for (const lead of [
    { contact_value: 'ana@example.com' },
    { contact_value: '+506 8888-7777' },
    { contact_value: 'nobody@example.com' },
    { contact_value: 'not-a-contact' },
  ]) {
    assert.deepEqual(getLeadConversion(lead, index), getLeadConversion(lead, orders));
  }
});

test('the index resolves to the same order the linear scan picked first', () => {
  const orders = [
    { id: 'newest', status: 'Paid', customer_phone: '50688887777' },
    { id: 'older', status: 'Paid', customer_email: 'ana@example.com' },
  ];
  const lead = { contact_value: 'ana@example.com', phone: '+506 8888-7777' };

  assert.equal(getLeadConversion(lead, createPaidOrderIndex(orders)).order.id, 'newest');
  assert.equal(getLeadConversion(lead, orders).order.id, 'newest');
});

test('an unpaid order never seeds the index', () => {
  const index = createPaidOrderIndex([{ id: 'x', status: 'Unpaid', customer_email: 'ana@example.com' }]);
  assert.equal(index.byEmail.size, 0);
  assert.equal(leadIsActiveForPipeline({ contact_value: 'ana@example.com' }, index), true);
});
