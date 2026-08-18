import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DORMANT_WINDOW_DAYS,
  ENGAGED_WINDOW_DAYS,
  buildBehaviorSignals,
  behaviorNeedsEngagement,
  behaviorNeedsOrders,
  matchesBehaviorFilter,
  normalizeBehaviorFilter,
  signalsFor,
} from '../src/lib/campaignBehavior.mjs';
import { resolveCampaignAudience } from '../src/lib/campaignAudience.mjs';

const NOW = Date.UTC(2026, 7, 18);
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

test('an unknown filter falls back to no filtering', () => {
  // A typo or a stale browser tab must never silently narrow who gets mailed.
  for (const value of ['', null, undefined, 'openers', 'DROP TABLE']) {
    assert.equal(normalizeBehaviorFilter(value), 'none');
  }
  assert.equal(normalizeBehaviorFilter('ENGAGED'), 'engaged');
});

test('engaged means opened or clicked inside the window', () => {
  const inside = { lastOpenAt: daysAgo(ENGAGED_WINDOW_DAYS - 1), lastClickAt: null };
  const outside = { lastOpenAt: daysAgo(ENGAGED_WINDOW_DAYS + 1), lastClickAt: null };
  assert.equal(matchesBehaviorFilter('engaged', inside, NOW), true);
  assert.equal(matchesBehaviorFilter('engaged', outside, NOW), false);
  // A click counts even with no open — image-blocking clients never load the pixel.
  assert.equal(matchesBehaviorFilter('engaged', { lastClickAt: daysAgo(3) }, NOW), true);
});

test('clicked ignores opens', () => {
  assert.equal(matchesBehaviorFilter('clicked', { lastOpenAt: daysAgo(1) }, NOW), false);
  assert.equal(matchesBehaviorFilter('clicked', { lastClickAt: daysAgo(1) }, NOW), true);
});

test('dormant includes people who have never engaged at all', () => {
  // They are exactly who a win-back is for. Requiring a stale event instead
  // would quietly mean "used to be active", a much smaller list.
  assert.equal(matchesBehaviorFilter('dormant', {}, NOW), true);
  assert.equal(matchesBehaviorFilter('dormant', { lastOpenAt: daysAgo(DORMANT_WINDOW_DAYS + 1) }, NOW), true);
  assert.equal(matchesBehaviorFilter('dormant', { lastOpenAt: daysAgo(DORMANT_WINDOW_DAYS - 1) }, NOW), false);
  assert.equal(matchesBehaviorFilter('dormant', { lastClickAt: daysAgo(2) }, NOW), false);
});

test('engaged and dormant never both match the same person', () => {
  for (const days of [0, 30, 89, 90, 120, 179, 180, 400]) {
    const signals = { lastOpenAt: daysAgo(days) };
    const engaged = matchesBehaviorFilter('engaged', signals, NOW);
    const dormant = matchesBehaviorFilter('dormant', signals, NOW);
    assert.ok(!(engaged && dormant), `both matched at ${days} days`);
  }
});

test('customers and prospects split the list exactly', () => {
  assert.equal(matchesBehaviorFilter('customers', { orderCount: 1 }, NOW), true);
  assert.equal(matchesBehaviorFilter('customers', { orderCount: 0 }, NOW), false);
  assert.equal(matchesBehaviorFilter('prospects', { orderCount: 0 }, NOW), true);
  assert.equal(matchesBehaviorFilter('prospects', { orderCount: 2 }, NOW), false);
});

test('none matches everybody, including a total unknown', () => {
  assert.equal(matchesBehaviorFilter('none', {}, NOW), true);
  assert.equal(matchesBehaviorFilter('none', { lastOpenAt: daysAgo(9999) }, NOW), true);
});

test('a garbage timestamp does not count as engagement', () => {
  assert.equal(matchesBehaviorFilter('engaged', { lastOpenAt: 'not-a-date' }, NOW), false);
  assert.equal(matchesBehaviorFilter('dormant', { lastOpenAt: 'not-a-date' }, NOW), true);
});

test('signals are folded per address, keeping the most recent event', () => {
  const subscriberEmails = new Map([['s1', 'Alice@Example.com'], ['s2', 'bob@example.com']]);
  const signals = buildBehaviorSignals({
    opens: [
      // `at` is the alias the queries give the table's own timestamp column —
      // opened_at here, clicked_at below. See campaignEventColumns.mjs.
      { subscriber_id: 's1', at: daysAgo(10) },
      { subscriber_id: 's1', at: daysAgo(2) },
    ],
    clicks: [{ subscriber_id: 's2', at: daysAgo(5) }],
    orders: [{ customer_email: 'ALICE@example.com' }, { customer_email: 'alice@example.com' }],
    subscriberEmails,
  });

  const alice = signalsFor(signals, 'alice@example.com');
  assert.equal(alice.lastOpenAt, daysAgo(2));
  // Case differs between the subscriber row and the order row; both must land
  // on the same person or "has ordered before" misses real customers.
  assert.equal(alice.orderCount, 2);
  assert.equal(signalsFor(signals, 'bob@example.com').lastClickAt, daysAgo(5));
  assert.equal(signalsFor(signals, 'nobody@example.com').orderCount, 0);
});

test('only the filters that need history ask for it', () => {
  assert.equal(behaviorNeedsEngagement('engaged'), true);
  assert.equal(behaviorNeedsEngagement('dormant'), true);
  assert.equal(behaviorNeedsEngagement('customers'), false);
  assert.equal(behaviorNeedsOrders('customers'), true);
  assert.equal(behaviorNeedsOrders('engaged'), false);
  // The default must cost nothing at all.
  assert.equal(behaviorNeedsEngagement('none'), false);
  assert.equal(behaviorNeedsOrders('none'), false);
});

test('the sender\'s live filter overrides the saved campaign row', () => {
  // Same gap that once let a send promise 1,481 recipients and deliver to 43:
  // the builder holds the choice in local state until someone saves.
  const campaign = { audience_scope: 'all', behavior_filter: 'none' };
  const resolved = resolveCampaignAudience(campaign, { scope: 'all', behaviorFilter: 'dormant' });
  assert.equal(resolved.behaviorFilter, 'dormant');
  assert.equal(resolved.changed, true);
});

test('a send that names no filter keeps the saved one', () => {
  const campaign = { audience_scope: 'all', behavior_filter: 'engaged' };
  const resolved = resolveCampaignAudience(campaign, { scope: 'all' });
  assert.equal(resolved.behaviorFilter, 'engaged');
  assert.equal(resolved.changed, false);
});

test('a campaign saved before this shipped reads as unfiltered', () => {
  const resolved = resolveCampaignAudience({ audience_scope: 'subscribers' }, null);
  assert.equal(resolved.behaviorFilter, 'none');
});
