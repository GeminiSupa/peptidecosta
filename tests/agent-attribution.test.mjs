import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CUSTOMER_HISTORY_SOURCE,
  buildAgentHistory,
  buildAgentNameResolver,
  emailKey,
  findHistoricalAgent,
  historicalAgentForLead,
  historicalAttributionFor,
  isClosedOrder,
  lookupHistoricalAgent,
  phoneKey,
  phoneLikePattern,
} from '../src/lib/agentAttribution.mjs';

/** Does Postgres LIKE `pattern` match `value`? (% only — these have no _.) */
function likeMatches(pattern, value) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '[\\s\\S]*');
  return new RegExp(`^${escaped}$`).test(value);
}

test('the phone lookup pattern matches every format the order book actually holds', () => {
  // Real values read from production `orders.customer_phone`. Half of these
  // never matched the old `%<8 digits>%` pattern, so those customers lost the
  // agent who first closed them.
  const realWorld = [
    '50684046973', '8878-9080', '8879-2516', '83-81-63-11', '8324 8738',
    '8709-9965', '8371 6200', '+(619)6515619', '1(925)6994985', '+50688462597',
  ];

  for (const stored of realWorld) {
    const key = phoneKey(stored);
    assert.ok(key, `${stored} should yield a key`);
    assert.equal(
      likeMatches(phoneLikePattern(key), stored),
      true,
      `pattern for ${key} must match the stored value ${stored}`,
    );
  }
});

test('a loose phone pattern never credits the wrong customer on its own', () => {
  // The pattern is intentionally permissive, so the strict key check behind it
  // is what actually decides ownership.
  const pattern = phoneLikePattern(phoneKey('8404-6973'));
  const otherCustomer = '8404697312';
  assert.equal(likeMatches(pattern, otherCustomer), true, 'loose pattern does over-match');

  // ...but the history is keyed on the real last 8 digits, so it is not a match.
  const history = buildAgentHistory([
    { status: 'Paid', sales_agent: 'Korinne', customer_phone: otherCustomer, created_at: '2026-01-01' },
  ]);
  assert.equal(findHistoricalAgent(history, { phone: '8404-6973' }), null);
});

test('an unmatched phone key produces no pattern at all', () => {
  assert.equal(phoneLikePattern(''), '');
  assert.equal(phoneLikePattern('wendy'), '');
});

/** Minimal stand-in for the Supabase query builder used by the lookup. */
function stubSupabase(rows, onQuery = () => {}) {
  return {
    from(table) {
      return {
        select() {
          return {
            in(column, values) {
              return {
                ilike(field, value) {
                  onQuery({ table, column, values, field, value });
                  return Promise.resolve({ data: rows });
                },
              };
            },
          };
        },
      };
    },
  };
}

const closed = (over = {}) => ({
  status: 'Paid',
  created_at: '2026-01-01T00:00:00Z',
  sales_agent: 'Dani',
  customer_phone: '+506 8404-6973',
  customer_email: 'joe@example.com',
  ...over,
});

test('only a closed order can hand a customer to an agent', () => {
  assert.equal(isClosedOrder({ status: 'Paid' }), true);
  assert.equal(isClosedOrder({ status: 'Completed' }), true);
  assert.equal(isClosedOrder({ status: 'order complete' }), true);
  assert.equal(isClosedOrder({ status: 'Pending' }), false);
  assert.equal(isClosedOrder({ status: 'Declined' }), false);
  assert.equal(isClosedOrder({}), false);
});

test('the same phone typed five different ways is one customer', () => {
  const key = phoneKey('+506 8404-6973');
  assert.equal(phoneKey('50684046973'), key);
  assert.equal(phoneKey('8404 6973'), key);
  assert.equal(phoneKey('(506) 8404.6973'), key);
  assert.equal(phoneKey('+50684046973'), key);
});

test('a phone too short to identify anyone owns nobody', () => {
  assert.equal(phoneKey('1234'), '');
  assert.equal(phoneKey(''), '');
  assert.equal(phoneKey(null), '');
  assert.equal(phoneKey(undefined), '');
});

test('email casing and padding do not split one customer in two', () => {
  assert.equal(emailKey('  Joe@Example.COM '), 'joe@example.com');
  assert.equal(emailKey('not-an-email'), '');
  assert.equal(emailKey(null), '');
});

test('the first agent to close the customer keeps them, not the most recent', () => {
  const history = buildAgentHistory([
    closed({ sales_agent: 'Dani', created_at: '2026-03-01T00:00:00Z' }),
    closed({ sales_agent: 'Webster', created_at: '2026-01-15T00:00:00Z' }),
    closed({ sales_agent: 'Pollita', created_at: '2026-06-01T00:00:00Z' }),
  ]);

  assert.equal(findHistoricalAgent(history, { phone: '8404-6973' }).agent, 'Webster');
  assert.equal(findHistoricalAgent(history, { email: 'joe@example.com' }).agent, 'Webster');
});

test('a customer is found by phone alone or email alone, not only by both', () => {
  const history = buildAgentHistory([closed({ sales_agent: 'Dani' })]);

  assert.equal(findHistoricalAgent(history, { phone: '50684046973' }).agent, 'Dani');
  assert.equal(findHistoricalAgent(history, { email: 'joe@example.com' }).agent, 'Dani');
  assert.equal(findHistoricalAgent(history, { phone: '8404-6973', email: 'other@x.com' }).agent, 'Dani');
});

test('when phone and email point at different agents, the earlier close wins', () => {
  const history = buildAgentHistory([
    closed({
      sales_agent: 'Webster',
      created_at: '2026-01-01T00:00:00Z',
      customer_phone: '8404-6973',
      customer_email: null,
    }),
    closed({
      sales_agent: 'Pollita',
      created_at: '2026-05-01T00:00:00Z',
      customer_phone: null,
      customer_email: 'joe@example.com',
    }),
  ]);

  const match = findHistoricalAgent(history, { phone: '8404-6973', email: 'joe@example.com' });
  assert.equal(match.agent, 'Webster');
});

test('unpaid and unassigned orders never create ownership', () => {
  const history = buildAgentHistory([
    closed({ status: 'Pending', sales_agent: 'Dani' }),
    closed({ status: 'Declined', sales_agent: 'Pollita' }),
    closed({ sales_agent: '   ' }),
    closed({ sales_agent: null }),
  ]);

  assert.equal(history.size, 0);
  assert.equal(findHistoricalAgent(history, { phone: '8404-6973' }), null);
});

test('a brand new customer is not credited to anyone', () => {
  const history = buildAgentHistory([closed()]);
  assert.equal(findHistoricalAgent(history, { phone: '2222-3333', email: 'new@x.com' }), null);
  assert.equal(findHistoricalAgent(history, {}), null);
  assert.equal(findHistoricalAgent(new Map(), { phone: '8404-6973' }), null);
});

test('a referral link keeps the order — history never overwrites it', () => {
  const history = buildAgentHistory([closed({ sales_agent: 'Webster' })]);

  const referred = {
    customer_phone: '8404-6973',
    customer_email: 'joe@example.com',
    sales_agent: 'Pollita',
  };

  assert.equal(historicalAttributionFor(referred, history), null);
});

test('an order with no agent is filled in from history at the standard rate', () => {
  const history = buildAgentHistory([closed({ sales_agent: 'Webster' })]);

  const patch = historicalAttributionFor({
    customer_phone: '+506 8404 6973',
    customer_email: null,
  }, history);

  assert.deepEqual(patch, {
    sales_agent: 'Webster',
    agent_commission_source: CUSTOMER_HISTORY_SOURCE,
  });
  // The 20% override belongs to referral links only.
  assert.equal('agent_commission_rate_override' in patch, false);
});

test('an agent recorded by email is the same person as their name', () => {
  const resolveAgent = buildAgentNameResolver([
    { name: 'Korinne', email: 'korinneda@icloud.com' },
    { name: 'Pollita', email: 'Camilledankers11@gmail.com' },
  ]);

  assert.equal(resolveAgent('korinneda@icloud.com'), 'Korinne');
  assert.equal(resolveAgent('KORINNEDA@ICLOUD.COM'), 'Korinne');
  assert.equal(resolveAgent('korinneda'), 'Korinne');
  assert.equal(resolveAgent('Korinne'), 'Korinne');
  assert.equal(resolveAgent('camilledankers11@gmail.com'), 'Pollita');
});

test('an agent who has left the team still matches their own past orders', () => {
  const resolveAgent = buildAgentNameResolver([{ name: 'Korinne', email: 'k@x.com' }]);
  assert.equal(resolveAgent('Someone Who Left'), 'Someone Who Left');
  assert.equal(resolveAgent(''), '');
});

test('orders naming one agent two ways do not split that customer in two', () => {
  const resolveAgent = buildAgentNameResolver([{ name: 'Korinne', email: 'korinneda@icloud.com' }]);

  const history = buildAgentHistory([
    closed({
      sales_agent: 'korinneda@icloud.com',
      created_at: '2026-01-01T00:00:00Z',
      customer_email: 'shopper@example.com',
      customer_phone: null,
    }),
    closed({
      sales_agent: 'Korinne',
      created_at: '2026-04-01T00:00:00Z',
      customer_phone: '8888-7777',
      customer_email: null,
    }),
  ], { resolveAgent });

  assert.equal(findHistoricalAgent(history, { email: 'shopper@example.com' }).agent, 'Korinne');
  assert.equal(findHistoricalAgent(history, { phone: '8888-7777' }).agent, 'Korinne');
});

test('the lookup only asks the database about closed orders', async () => {
  const seen = [];
  const supabase = stubSupabase([closed({ sales_agent: 'Dani' })], (query) => seen.push(query));

  const match = await lookupHistoricalAgent(supabase, {
    phone: '+506 8404-6973',
    email: 'Joe@Example.com',
  });

  assert.equal(match.agent, 'Dani');
  assert.equal(seen.length, 2, 'one query for the phone, one for the email');
  for (const query of seen) {
    assert.equal(query.table, 'orders');
    assert.deepEqual(query.values, ['Paid', 'Completed', 'Order Complete']);
  }
  // Email is matched case-insensitively and without wildcards.
  assert.equal(seen[1].value, 'joe@example.com');
  // Phone matches on the last 8 digits, wildcarded between each one so a number
  // stored as "8404-6973" is still found. The strict key check in
  // buildAgentHistory is what rejects an over-match.
  assert.equal(seen[0].value, '%8%4%0%4%6%9%7%3%');
});

test('a customer with no usable phone or email never hits the database', async () => {
  let called = false;
  const supabase = stubSupabase([], () => { called = true; });

  assert.equal(await lookupHistoricalAgent(supabase, { phone: '12', email: 'nope' }), null);
  assert.equal(await lookupHistoricalAgent(supabase, {}), null);
  assert.equal(await lookupHistoricalAgent(null, { phone: '50684046973' }), null);
  assert.equal(called, false);
});

test('a lead is matched whether its one contact value is a phone or an email', () => {
  const history = buildAgentHistory([closed({ sales_agent: 'Dani' })]);

  assert.equal(historicalAgentForLead({ contact_value: 'joe@example.com' }, history), 'Dani');
  assert.equal(historicalAgentForLead({ contact_value: '50684046973' }, history), 'Dani');
  assert.equal(historicalAgentForLead({ contact_value: 'nobody@x.com' }, history), null);
  assert.equal(historicalAgentForLead(null, history), null);
});
