import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  TAX_RECORDS_CC_EMAIL,
  buildTaxRecordsCopy,
  buildTaxRecordsPayoutCopy,
  isCompletedOrderStatus,
  sendTaxRecordsCopy,
  sendTaxRecordsPayoutCopy,
  taxRecordsFrom,
  taxRecordsRecipients,
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

test('completed orders have an accounting-only replay that does not require a customer email', () => {
  const shippedRoute = fs.readFileSync('src/app/api/order-shipped-notification/route.js', 'utf8');
  const adminPage = fs.readFileSync('src/app/admin/page.js', 'utf8');
  const detailPanel = fs.readFileSync('src/components/admin/OrderDetailPanel.js', 'utf8');

  assert.match(shippedRoute, /payload\?\.accountingOnly === true/);
  assert.match(shippedRoute, /resolveTaxRecordsMailer\(/);
  assert.doesNotMatch(shippedRoute, /if \(!order\.customer_email[\s\S]{0,200}return NextResponse/);
  assert.match(adminPage, /accountingOnly: true/);
  assert.match(detailPanel, /Resend accounting only/);
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

test('the accounting copy can reach more than one mailbox', async () => {
  // pbagcr@ is currently rejected at Rackspace's door — mail arrives from
  // Elastic carrying its own domain in From. A second address on a provider
  // that does accept the send keeps the tax records flowing meanwhile.
  const previous = process.env.TAX_RECORDS_CC_EMAIL;
  process.env.TAX_RECORDS_CC_EMAIL = 'pbagcr@peptidescostarica.net, backup@gmail.com';

  try {
    assert.deepEqual(taxRecordsRecipients(), [
      'pbagcr@peptidescostarica.net',
      'backup@gmail.com',
    ]);
    // Whitespace and empty entries from a hand-typed dashboard value.
    assert.deepEqual(
      taxRecordsRecipients('  a@b.com ,, c@d.com  '),
      ['a@b.com', 'c@d.com'],
    );
    // Never silently sends nowhere.
    assert.deepEqual(taxRecordsRecipients(''), ['pbagcr@peptidescostarica.net']);
  } finally {
    if (previous === undefined) delete process.env.TAX_RECORDS_CC_EMAIL;
    else process.env.TAX_RECORDS_CC_EMAIL = previous;
  }
});

test('the accounting copy can be sent from a different address than the receipt', async () => {
  // The rejection is triggered by the From domain, so this message can be
  // pointed at a sender Rackspace treats as ordinary external mail without
  // changing anything a customer sees.
  const previous = process.env.TAX_RECORDS_FROM;

  try {
    assert.equal(taxRecordsFrom('Shop <info@peptidescostarica.net>'), 'Shop <info@peptidescostarica.net>');

    process.env.TAX_RECORDS_FROM = 'Records <records@mail.example.net>';
    assert.equal(taxRecordsFrom('Shop <info@peptidescostarica.net>'), 'Records <records@mail.example.net>');

    const sent = [];
    await sendTaxRecordsCopy({
      transporter: { sendMail: async (m) => { sent.push(m); return { messageId: 'x' }; } },
      from: 'Shop <info@peptidescostarica.net>',
      order: { status: 'Order Complete', order_number: 'PCR-5' },
    });
    assert.equal(sent[0].from, 'Records <records@mail.example.net>');
  } finally {
    if (previous === undefined) delete process.env.TAX_RECORDS_FROM;
    else process.env.TAX_RECORDS_FROM = previous;
  }
});

test('an approved payout copy names the payee and the period', () => {
  const message = buildTaxRecordsPayoutCopy({
    payout: { kind: 'afiliado', name: 'Dani', period: '2026-08-04 → 2026-08-10' },
    html: '<p>invoice</p>',
    text: 'invoice',
  });

  assert.equal(message.to, taxRecordsRecipients().join(', '));
  assert.match(message.subject, /Pago aprobado/);
  assert.match(message.subject, /afiliado/);
  assert.match(message.subject, /Dani/);
  assert.match(message.subject, /2026-08-04/);
  assert.match(message.html, /invoice/);
});

test('the payout copy goes to accounting even when the payee send fails', async () => {
  const sent = [];
  const transporter = {
    sendMail: async (message) => {
      sent.push(message);
      return { messageId: 'payout-1' };
    },
  };

  const result = await sendTaxRecordsPayoutCopy({
    transporter,
    from: 'Peptides <info@peptidescostarica.net>',
    payout: { kind: 'afiliado', name: 'Dani' },
    html: '<p>invoice</p>',
    text: 'invoice',
  });

  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, taxRecordsRecipients().join(', '));
});

test('a payout copy with no transport is reported, never thrown', async () => {
  const result = await sendTaxRecordsPayoutCopy({ transporter: null, payout: { name: 'Dani' } });
  assert.equal(result.sent, false);
  assert.equal(result.error, 'no transporter');
});

test('the affiliate never sees the accountant in CC', () => {
  // An affiliate is an outside party. The accountant gets their own message;
  // putting them in the CC would publish that address to every affiliate, which
  // is the exact mistake the completed-order receipt already had to undo.
  const route = fs.readFileSync('src/app/api/admin/affiliates/payouts/approve/route.js', 'utf8');

  assert.doesNotMatch(route, /cc: withTaxRecordsCc/);
  assert.match(route, /sendTaxRecordsPayoutCopy\(/);
});

test('only approved payout slips reach accounting', () => {
  // Both approval routes return on rejection before any mail is built, so a
  // rejected slip — which is not an expense — never reaches the accountant.
  for (const path of [
    'src/app/api/admin/affiliates/payouts/approve/route.js',
    'src/app/api/admin/commissions/approve/route.js',
  ]) {
    const route = fs.readFileSync(path, 'utf8');
    const rejectionReturn = route.indexOf("status: 'Rejected' });");
    const firstSend = route.indexOf('sendMail');

    assert.ok(rejectionReturn > -1, `${path} has no rejection path`);
    assert.ok(rejectionReturn < firstSend, `${path} builds mail before returning on rejection`);
  }
});

test('no route freezes its mail credentials at module load', () => {
  // Next evaluates a route module once, when it is first loaded. Destructuring
  // the SMTP config there captures whatever process.env held at that instant
  // and keeps it for the life of the deployment — so a build that ran before
  // ORDER_SMTP_* existed froze `undefined`, and every send behind a
  // `if (!SMTP_HOST) skip` guard quietly did nothing while answering 200.
  // Fixed once for the shipped route in 673620e; this stops it coming back
  // anywhere, rather than naming the routes that had it.
  const moduleScopeRead = /^const \{[^}]*\} = getTransactionalSmtpConfig\(\);/m;
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        const source = fs.readFileSync(full, 'utf8');
        if (moduleScopeRead.test(source)) offenders.push(full);
      }
    }
  };
  walk('src/app/api');

  assert.deepEqual(offenders, []);
});
