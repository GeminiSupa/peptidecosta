import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routeSrc = () => readFile(
  new URL('../src/app/api/order-shipped-notification/route.js', import.meta.url),
  'utf8',
);

test('the accounting copy is not sent the Trustpilot script block', async () => {
  const src = await routeSrc();

  // The two sends, in the order they appear: the customer's receipt, then the
  // accounting copy.
  const taxCallAt = src.indexOf('sendTaxRecordsCopy({');
  assert.ok(taxCallAt > 0, 'the accounting copy is still sent');
  const taxCall = src.slice(taxCallAt, taxCallAt + 400);

  assert.match(taxCall, /html: customerHtml,/, 'accounting gets the plain receipt');
  assert.doesNotMatch(
    taxCall,
    /html: customerHtmlWithTrustpilot/,
    'a <script> tag in the body is a spam signal and accounting has no use for it',
  );
});

test('the customer copy carries the block only for the BCC fallback', async () => {
  const src = await routeSrc();
  const sendAt = src.indexOf('to: order.customer_email.trim()');
  assert.ok(sendAt > 0);
  const customerCall = src.slice(Math.max(0, sendAt - 300), sendAt + 300);
  assert.match(customerCall, /html: customerHtmlWithTrustpilot/);
  assert.match(src, /wantsInvitation && !useTriggerEmail\s*\? customerHtml \+ trustpilotSnippet/);
  assert.match(src, /wantsInvitation && !useTriggerEmail \? trustpilotAddress : null/);
});

test('Trustpilot is contacted only when an eligible invitation is wanted', async () => {
  const src = await routeSrc();
  assert.match(src, /shouldSendCustomer && useTrustpilot && !alreadyInvited && Boolean\(trustpilotAddress\)/);
  assert.match(src, /if \(useTriggerEmail && wantsInvitation && customerInfo\)/);
});
