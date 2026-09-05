import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decideForOrder, loadReviewAskHistory, recordReviewAsk, reviewClickUrl } from '../src/lib/reviewAskHistory.mjs';
import { buildReviewRequestEmail } from '../src/lib/reviewRequestEmail.mjs';

/** A Supabase stand-in: enough chaining for the two queries these helpers make. */
function fakeDb({ selectResult, insertResult }) {
  return {
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => Promise.resolve(selectResult),
        insert: () => ({ select: () => ({ single: () => Promise.resolve(insertResult) }) }),
      };
      return chain;
    },
  };
}

test('an unreadable history asks for nothing but is marked for retry', async () => {
  const db = fakeDb({ selectResult: { data: null, error: { message: 'relation does not exist' } } });
  const d = await decideForOrder(db, { customer_email: 'ana@example.com' });
  assert.equal(d.ask, false);
  assert.equal(d.retry, true, 'must be reconsidered once the table exists, not retired');
});

test('a readable history produces a final decision', async () => {
  const db = fakeDb({ selectResult: { data: [], error: null } });
  const d = await decideForOrder(db, { customer_email: 'ana@example.com' }, { firstChoice: 'google' });
  assert.equal(d.ask, true);
  assert.equal(d.retry, false);
});

test('a customer with no email is never looked up', async () => {
  const { ok, rows } = await loadReviewAskHistory(fakeDb({ selectResult: { data: [], error: null } }), '');
  assert.equal(ok, false);
  assert.deepEqual(rows, []);
});

test('recording an ask returns the id the click links need', async () => {
  const db = fakeDb({ selectResult: { data: [], error: null }, insertResult: { data: { id: 'ask-1' }, error: null } });
  const id = await recordReviewAsk(db, { email: 'Ana@Example.com', order: { id: 7 }, platforms: ['google'] });
  assert.equal(id, 'ask-1');
});

test('a failed recording does not throw, it just has no id', async () => {
  const db = fakeDb({ selectResult: { data: [], error: null }, insertResult: { data: null, error: { message: 'nope' } } });
  assert.equal(await recordReviewAsk(db, { email: 'a@b.c', order: {}, platforms: ['google'] }), null);
  assert.equal(await recordReviewAsk(db, { email: '', order: {}, platforms: ['google'] }), null);
  assert.equal(await recordReviewAsk(db, { email: 'a@b.c', order: {}, platforms: [] }), null);
});

test('click links go through our redirect and carry the site', () => {
  const url = reviewClickUrl('ask-1', 'google', 'https://maps.app.goo.gl/x');
  assert.match(url, /\/api\/reviews\/click\?a=ask-1&p=google$/);
  assert.doesNotMatch(url, /maps\.app\.goo\.gl/, 'the destination must not travel in the url');
});

test('without an ask id the button still works, it is just not counted', () => {
  assert.equal(reviewClickUrl(null, 'google', 'https://maps.app.goo.gl/x'), 'https://maps.app.goo.gl/x');
});

test('the email shows only the sites still on offer', () => {
  // Someone who already clicked Google is offered Facebook alone.
  const { html } = buildReviewRequestEmail({
    customerName: 'Ana',
    lang: 'es',
    destinations: { google: '', facebook: 'https://site/api/reviews/click?a=1&p=facebook', trustpilot: '' },
  });
  assert.ok(html.includes('p=facebook'), 'the offered site is there');
  assert.doesNotMatch(html, /Rese.ar en Google/, 'the site they already used is not');
  assert.doesNotMatch(html, /trustpilot/i);
});

test('the click route resolves its destination server-side, never from the url', async () => {
  const source = await readFile(new URL('../src/app/api/reviews/click/route.js', import.meta.url), 'utf8');
  // An emailed redirect that takes its target from a query parameter is an open
  // redirect. The destination must come from settings.
  assert.doesNotMatch(source, /searchParams\.get\(['"]url['"]\)/);
  assert.match(source, /reviewDestinations/);
  assert.match(source, /\.is\('clicked_platform', null\)/, 'first click only');
});

test('both send paths decide from the same history helper', async () => {
  const cron = await readFile(new URL('../src/app/api/cron/review-requests/route.js', import.meta.url), 'utf8');
  const completion = await readFile(new URL('../src/app/api/order-shipped-notification/route.js', import.meta.url), 'utf8');
  for (const [name, src] of [['cron', cron], ['completion', completion]]) {
    assert.match(src, /decideForOrder/, `${name} uses the shared decision`);
  }
  assert.match(cron, /decision\.offer/, 'the cron only offers what is left');
  assert.match(cron, /if \(!decision\.retry\)/, 'the cron never retires an order it could not decide');
  assert.match(completion, /!reviewDecision\.retry/, 'nor does the completion route');
});
