import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  TAX_RECORDS_CC_EMAIL,
  buildTaxRecordsCopy,
  isCompletedOrderStatus,
  sendTaxRecordsCopy,
  withTaxRecordsCc,
} from '../src/lib/taxRecordsEmail.mjs';

test('uses the established PBAG Costa Rica forwarding address', () => {
  assert.equal(TAX_RECORDS_CC_EMAIL, 'pbagcr@peptidescostarica.net');
  assert.equal(withTaxRecordsCc(), TAX_RECORDS_CC_EMAIL);
});

test('accounting only wants an order once it is final', () => {
  assert.equal(isCompletedOrderStatus('Completed'), true);
  assert.equal(isCompletedOrderStatus('Order Complete'), true);
  assert.equal(isCompletedOrderStatus('order complete'), true);
  assert.equal(isCompletedOrderStatus('Paid'), false);
  assert.equal(isCompletedOrderStatus('Pending'), false);
  assert.equal(isCompletedOrderStatus('Pending - Card'), false);
  assert.equal(isCompletedOrderStatus('Cancelled'), false);
});

test('the customer receipt never carries the accountant in CC', () => {
  // The whole point of the split: TAX_RECORDS_CC_EMAIL used to be published in
  // the CC header of every completed-order receipt, so whatever that variable
  // held was readable by every buyer.
  const orderRoute = fs.readFileSync('src/app/api/order-notification/route.js', 'utf8');
  const shippedRoute = fs.readFileSync('src/app/api/order-shipped-notification/route.js', 'utf8');

  assert.doesNotMatch(orderRoute, /cc: taxRecordsCcForCompletedOrder/);
  assert.doesNotMatch(shippedRoute, /cc: taxRecordsCcForCompletedOrder/);

  // Both completion paths must still reach accounting, as their own send.
  assert.match(orderRoute, /sendTaxRecordsCopy\(/);
  assert.match(shippedRoute, /sendTaxRecordsCopy\(/);
});

test('the accountant copy survives a failed customer send', async () => {
  // The failure the CC could not survive: a bad customer address took
  // accounting's copy of the sale with it.
  const sent = [];
  const transporter = {
    sendMail: async (message) => {
      sent.push(message);
      return { messageId: 'tax-1' };
    },
  };

  const result = await sendTaxRecordsCopy({
    transporter,
    from: 'Peptides <info@peptidescostarica.net>',
    order: { status: 'Order Complete', order_number: 'PCR-1042', customer_name: 'Ana Rojas' },
    html: '<p>receipt</p>',
    text: 'receipt',
  });

  assert.equal(result.sent, true);
  assert.equal(result.messageId, 'tax-1');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, TAX_RECORDS_CC_EMAIL);
  assert.equal(sent[0].cc, undefined);
  assert.equal(sent[0].bcc, undefined);
  assert.match(sent[0].subject, /PCR-1042/);
  assert.match(sent[0].subject, /Ana Rojas/);
});

test('a failed accounting send is reported, never thrown', async () => {
  // Callers run this after the customer send and must not have to guard it.
  const transporter = { sendMail: async () => { throw new Error('550 mailbox unavailable'); } };

  const result = await sendTaxRecordsCopy({
    transporter,
    order: { status: 'Completed', order_number: 'PCR-9' },
  });

  assert.equal(result.sent, false);
  assert.match(result.error, /550/);
});

test('unfinished orders and missing transport are reported distinctly', async () => {
  const transporter = { sendMail: async () => assert.fail('must not send for an unfinished order') };

  assert.deepEqual(
    await sendTaxRecordsCopy({ transporter, order: { status: 'Paid' } }),
    { sent: false, skipped: 'not-completed' },
  );

  const noTransport = await sendTaxRecordsCopy({ order: { status: 'Completed' } });
  assert.equal(noTransport.sent, false);
  assert.equal(noTransport.error, 'no transporter');
});

test('the copy is labelled so an accountant can file it without reading it', () => {
  const message = buildTaxRecordsCopy({
    order: { order_number: 'PCR-77', customer_name: 'Luis Mora' },
    html: '<p>body</p>',
    text: 'body',
  });

  assert.equal(message.to, TAX_RECORDS_CC_EMAIL);
  assert.match(message.subject, /Copia contable — Pedido PCR-77 — Luis Mora/);
  assert.match(message.html, /Copia contable/);
  assert.match(message.html, /<p>body<\/p>/);
  assert.match(message.text, /^Copia contable/);

  // An order with no number still produces a filable subject rather than
  // "undefined".
  assert.match(buildTaxRecordsCopy({}).subject, /sin número/);
});

test('internal commission mail keeps its CC, and unapproved reports still have none', () => {
  const weeklyRoute = fs.readFileSync('src/app/api/admin/commissions/weekly-report/route.js', 'utf8');
  const approvalRoute = fs.readFileSync('src/app/api/admin/commissions/approve/route.js', 'utf8');

  // That recipient is a sales agent on an already-internal CC list, not a customer.
  assert.match(approvalRoute, /cc: withTaxRecordsCc\(ADMIN_CC_EMAILS\)/);
  assert.doesNotMatch(weeklyRoute, /withTaxRecordsCc|sendTaxRecordsCopy/);
});

test('does not duplicate the tax inbox when it is already in CC', () => {
  assert.equal(
    withTaxRecordsCc(`finance@example.com, ${TAX_RECORDS_CC_EMAIL.toUpperCase()}`),
    `finance@example.com, ${TAX_RECORDS_CC_EMAIL.toUpperCase()}`
  );
});
