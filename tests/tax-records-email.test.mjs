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
  taxRecordsRecipients,
  taxRecordsPrimary,
  taxRecordsMonitors,
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

test('an approved commission reaches accounting on its own transport, not as a CC', () => {
  const weeklyRoute = fs.readFileSync('src/app/api/admin/commissions/weekly-report/route.js', 'utf8');
  const approvalRoute = fs.readFileSync('src/app/api/admin/commissions/approve/route.js', 'utf8');

  // The CC rode out on the agent's message, which leaves via Elastic carrying
  // the .net domain in From — the exact send Rackspace refuses for its own
  // mailboxes. Every approved payout was therefore recorded as sent while PBAG
  // received none of them, the same failure the order copy already fixed.
  assert.doesNotMatch(approvalRoute, /withTaxRecordsCc/);
  assert.match(approvalRoute, /cc: ADMIN_CC_EMAILS/);

  // Accounting gets its own message on the accounting mailbox instead.
  assert.match(approvalRoute, /resolveTaxRecordsMailer\(\)/);
  assert.match(approvalRoute, /sendTaxRecordsPayoutCopy\(/);
  // Reported, so a refusal cannot show as a green tick again.
  assert.match(approvalRoute, /accountingCopy,/);

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

test('the accounting copy uses the sender selected by its SMTP resolver', async () => {
  const sent = [];
  await sendTaxRecordsCopy({
    transporter: { sendMail: async (m) => { sent.push(m); return { messageId: 'x' }; } },
    from: 'Records <records@mail.example.net>',
    order: { status: 'Order Complete', order_number: 'PCR-5' },
  });
  assert.equal(sent[0].from, 'Records <records@mail.example.net>');
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

test('a resent copy says so in the subject and changes nothing else', () => {
  const payout = { kind: 'comision', name: 'Korinne', period: '2026-08-24 to 2026-08-30' };
  const original = buildTaxRecordsPayoutCopy({ payout, html: '<p>invoice</p>', text: 'invoice' });
  const resent = buildTaxRecordsPayoutCopy({ payout, html: '<p>invoice</p>', text: 'invoice', resent: true });

  assert.equal(resent.subject, `[Resent] ${original.subject}`);

  // Everything accounting actually files has to be byte-for-byte the first
  // copy, or the two cannot be reconciled as one payment.
  assert.equal(resent.html, original.html);
  assert.equal(resent.text, original.text);
  assert.equal(resent.to, original.to);
});

test('the resend route sends only an approved payout, and only to accounting', () => {
  const route = fs.readFileSync('src/app/api/admin/commissions/resend-accounting/route.js', 'utf8');

  // Guards, in order: only a superadmin, only a slip that was approved, and
  // only a report that was genuinely sent once already.
  assert.match(route, /requireSuperadmin: true/);
  assert.match(route, /APPROVED_STATUSES/);
  assert.match(route, /payout\.email_html/);
  assert.match(route, /resent: true/);

  // It resends; it never pays, re-approves, or writes to the payout.
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /status: 'Approved'/);

  // No second transport: the agent cannot be mailed from here.
  assert.doesNotMatch(route, /nodemailer/);

  // A refused address is an error, not a success. That inversion is the whole
  // reason this route had to be written.
  assert.match(route, /if \(!accountingCopy\.sent\)/);
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

test('one message, but only the accountant decides whether it counts as sent', async () => {
  // The watcher's inbox rides along on the same message on purpose. What must
  // not happen is its acceptance standing in for PBAG's refusal — the server
  // resolves the send and names the refused address in info.rejected.
  const previous = process.env.TAX_RECORDS_CC_EMAIL;
  process.env.TAX_RECORDS_CC_EMAIL = 'pbagcr@peptidescostarica.net, watcher@gmail.com';

  try {
    assert.equal(taxRecordsPrimary(), 'pbagcr@peptidescostarica.net');
    assert.deepEqual(taxRecordsMonitors(), ['watcher@gmail.com']);

    const sent = [];
    const result = await sendTaxRecordsCopy({
      transporter: {
        sendMail: async (message) => {
          sent.push(message);
          return { messageId: 'envelope-accepted', rejected: ['pbagcr@peptidescostarica.net'] };
        },
      },
      from: 'Records <records@mail.example.net>',
      order: { status: 'Order Complete', order_number: 'PCR-10' },
    });

    assert.equal(sent.length, 1, 'still one message, both addresses on it');
    assert.equal(sent[0].to, 'pbagcr@peptidescostarica.net, watcher@gmail.com');
    assert.equal(result.sent, false, 'the accountant decides, not the watcher');
    assert.match(result.error, /refused/);
  } finally {
    if (previous === undefined) delete process.env.TAX_RECORDS_CC_EMAIL;
    else process.env.TAX_RECORDS_CC_EMAIL = previous;
  }
});

test('an address the server refuses without throwing still counts as failed', async () => {
  // Nodemailer resolves and reports the refusal in info.rejected. Reading only
  // the messageId is what turned a refused PBAG address into a green tick.
  const result = await sendTaxRecordsCopy({
    transporter: {
      sendMail: async (message) => ({ messageId: 'accepted-envelope', rejected: [message.to] }),
    },
    from: 'Records <records@mail.example.net>',
    order: { status: 'Order Complete', order_number: 'PCR-11' },
  });

  assert.equal(result.sent, false);
  assert.match(result.error, /refused/);
});
