import test from 'node:test';
import assert from 'node:assert/strict';
import { getLeadConversion } from '../src/lib/leadConversion.mjs';

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
