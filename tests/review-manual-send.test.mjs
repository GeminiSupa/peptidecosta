import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

test('the manual send is behind an admin session', async () => {
  const src = await read('../src/app/api/admin/reviews/send/route.js');
  // It emails customers on demand; an open endpoint would let a stranger mail
  // every past buyer.
  const guards = src.match(/verifyAdminSession/g) || [];
  assert.ok(guards.length >= 2, 'both GET and POST must check the session');
});

test('only Google and Facebook can be sent by hand', async () => {
  const src = await read('../src/app/api/admin/reviews/send/route.js');
  // Trustpilot invitations are fired by Trustpilot from a BCC; there is nothing
  // to send on demand, and offering it would silently do nothing.
  assert.match(src, /TRACKABLE_PLATFORMS\.filter/);
  assert.match(src, /trustpilot: ''/);
});

test('the ask is recorded before the email is sent', async () => {
  const src = await read('../src/app/api/admin/reviews/send/route.js');
  const recordAt = src.indexOf('recordReviewAsk');
  const sendAt = src.indexOf('sendMail');
  assert.ok(recordAt > 0 && sendAt > 0);
  assert.ok(recordAt < sendAt, 'asked-but-not-sent is recoverable; sent-but-not-recorded asks them twice');
});

test('a manual send stops the automatic one', async () => {
  const src = await read('../src/app/api/admin/reviews/send/route.js');
  // Without stamping the order the cron would send a second request two days
  // later, which is the exact double-ask this feature exists to avoid.
  assert.match(src, /review_requested_at: new Date\(\)\.toISOString\(\)/);
  assert.match(src, /ORDER_REVIEW_PLATFORM_COLUMNS/);
});

test('an order with no email is refused rather than half-sent', async () => {
  const src = await read('../src/app/api/admin/reviews/send/route.js');
  assert.match(src, /no customer email address/i);
});

test('the button only appears on a completed order', async () => {
  const src = await read('../src/components/admin/OrderDetailPanel.js');
  // The JSX usage, not the import at the top of the file.
  const at = src.indexOf('<AskForReviewButton');
  assert.ok(at > 0, 'the button is rendered');
  // The guard immediately above it must be the completed-status check.
  const before = src.slice(Math.max(0, at - 600), at);
  assert.match(before, /\['Completed', 'Order Complete'\]\.includes\(order\.status\)/);
});

test('the second dialog warns that sending now replaces the automatic request', async () => {
  const src = await read('../src/components/admin/AskForReviewButton.js');
  assert.match(src, /queuedAutomatically/);
  assert.match(src, /replaces/);
  assert.match(src, /waitDays/);
});

test('the dialog defaults to the sites the rules would have offered', async () => {
  const src = await read('../src/components/admin/AskForReviewButton.js');
  // So a customer who already clicked Google opens with Facebook ticked.
  assert.match(src, /data\.suggested/);
});

test('nothing here uses alert()', async () => {
  for (const file of ['../src/components/admin/AskForReviewButton.js', '../src/components/admin/SocialReviewsSettings.js']) {
    const src = await read(file);
    // Comments are stripped first: a comment saying "never an alert()" is not
    // a call, and matching it made this test fail on the very thing it wants.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /(^|[^.\w])alert\s*\(/, `${file} must show errors inline, not in a browser dialog`);
  }
});
