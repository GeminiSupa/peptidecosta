import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COMMISSION_ELIGIBLE_ORDER_STATUSES,
  CUSTOMER_HISTORY_SOURCE,
  buildAgentHistory,
  buildAgentNameResolver,
  contactKeysFor,
  emailKey,
  findAmbiguousContactKeys,
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

test('a placeholder email shared by many customers owns none of them', () => {
  // Real data: abc@abc.com sits on 24 different customers, and an agent's own
  // address korinneda@icloud.com on 13. Treating either as an identity would
  // hand every one of those people to whoever closed the earliest.
  const orders = [
    { status: 'Order Complete', sales_agent: 'Dani', customer_name: 'Ana', customer_phone: '50611111111', customer_email: 'abc@abc.com', created_at: '2026-01-01' },
    { status: 'Order Complete', sales_agent: 'Dani', customer_name: 'Beto', customer_phone: '50622222222', customer_email: 'abc@abc.com', created_at: '2026-02-01' },
    { status: 'Order Complete', sales_agent: 'Dani', customer_name: 'Caro', customer_phone: '50633333333', customer_email: 'abc@abc.com', created_at: '2026-03-01' },
  ];
  const history = buildAgentHistory(orders);

  // A brand new person who also gives that placeholder must not inherit Ana's agent.
  assert.equal(findHistoricalAgent(history, { email: 'abc@abc.com' }), null);

  // Their own phone numbers still identify them normally.
  assert.equal(findHistoricalAgent(history, { phone: '50622222222' })?.agent, 'Dani');
});

test('a phone number shared by several customers owns none of them', () => {
  // 41 numbers in the order book are on more than one person.
  const orders = [
    { status: 'Order Complete', sales_agent: 'Korinne', customer_name: 'Ana', customer_phone: '86639549', customer_email: 'ana@example.com', created_at: '2026-01-01' },
    { status: 'Order Complete', sales_agent: 'Yese', customer_name: 'Beto', customer_phone: '86639549', customer_email: 'beto@example.com', created_at: '2026-02-01' },
  ];
  const history = buildAgentHistory(orders);

  assert.equal(findHistoricalAgent(history, { phone: '86639549' }), null, 'shared number owns nobody');
  assert.equal(findHistoricalAgent(history, { email: 'ana@example.com' })?.agent, 'Korinne');
  assert.equal(findHistoricalAgent(history, { email: 'beto@example.com' })?.agent, 'Yese');
});

test('one customer ordering twice is not mistaken for two people', () => {
  // The same person, once with an email and once without. Their phone must
  // still identify them rather than looking shared.
  const orders = [
    { status: 'Order Complete', sales_agent: 'Pollita', customer_name: 'Ana Mora', customer_phone: '50684046973', customer_email: 'ana@example.com', created_at: '2026-01-01' },
    { status: 'Order Complete', sales_agent: 'Pollita', customer_name: 'Ana Mora', customer_phone: '8404-6973', customer_email: '', created_at: '2026-03-01' },
  ];
  const history = buildAgentHistory(orders);
  assert.equal(findHistoricalAgent(history, { phone: '+506 8404 6973' })?.agent, 'Pollita');
});

test('ambiguous keys are reported for both contact types', () => {
  const orders = [
    { status: 'Order Complete', sales_agent: 'A', customer_name: 'One', customer_phone: '11111111', customer_email: 'shared@x.com', created_at: '2026-01-01' },
    { status: 'Order Complete', sales_agent: 'B', customer_name: 'Two', customer_phone: '22222222', customer_email: 'shared@x.com', created_at: '2026-01-02' },
    { status: 'Order Complete', sales_agent: 'C', customer_name: 'Three', customer_phone: '33333333', customer_email: 'solo@x.com', created_at: '2026-01-03' },
  ];
  const ambiguous = findAmbiguousContactKeys(orders);
  assert.equal(ambiguous.has('shared@x.com'), true);
  assert.equal(ambiguous.has('solo@x.com'), false);
  assert.equal(ambiguous.has('33333333'), false);
});

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
    { status: 'Order Complete', sales_agent: 'Korinne', customer_phone: otherCustomer, created_at: '2026-01-01' },
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
  status: 'Order Complete',
  created_at: '2026-01-01T00:00:00Z',
  sales_agent: 'Dani',
  customer_phone: '+506 8404-6973',
  customer_email: 'joe@example.com',
  ...over,
});

test('only a closed order can hand a customer to an agent', () => {
  assert.equal(isClosedOrder({ status: 'Order Complete' }), true);
  assert.equal(isClosedOrder({ status: 'Completed' }), true);
  assert.equal(isClosedOrder({ status: 'order complete' }), true);
  assert.equal(isClosedOrder({ status: 'Paid' }), true);
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
    // Tracks the shared constant rather than a copy of it, so adding a status
    // there (a partly refunded order is still a closed sale, and still the
    // agent's customer) does not fail this for the wrong reason.
    assert.deepEqual(query.values, COMMISSION_ELIGIBLE_ORDER_STATUSES);
    // The point of the test: an order that never settled must never decide who
    // a customer belongs to.
    for (const unpaid of ['Pending', 'Pending - Card', 'Declined', 'Error', 'Cancelled']) {
      assert.ok(!query.values.includes(unpaid), `${unpaid} must not be queried as a closed order`);
    }
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

// --- Both CRM tabs must answer "who owns this customer?" identically ---------
//
// The Customers tab and the Leads tab each used to derive ownership themselves.
// They drifted: Customers credited the LATEST closed order while Leads credited
// the EARLIEST, so a customer with two closed orders by two agents showed a
// different owner depending on which tab you opened. Both now call the helpers
// below, and these tests pin the rule so a future edit to one tab cannot
// silently re-open the gap.

const twoAgentCustomer = [
  {
    customer_name: 'Ana',
    customer_email: 'ana@correo.com',
    customer_phone: '+506 8404 6973',
    created_at: '2026-02-10',
    status: 'Completed',
    sales_agent: 'María',
  },
  {
    customer_name: 'Ana',
    customer_email: 'ana@correo.com',
    // Same person, number typed differently on the second order.
    customer_phone: '8404-6973',
    created_at: '2026-07-22',
    status: 'Completed',
    sales_agent: 'Carlos',
  },
];

test('the agent who closed first keeps the customer, not the most recent one', () => {
  const history = buildAgentHistory(twoAgentCustomer);
  const owner = findHistoricalAgent(history, {
    phone: '+506 8404 6973',
    email: 'ana@correo.com',
  });
  assert.equal(owner?.agent, 'María');
});

test('the Customers tab and the Leads tab resolve the same owner', () => {
  const history = buildAgentHistory(twoAgentCustomer);

  // How CustomersCRM asks: it has a grouped customer record.
  const customersTab = findHistoricalAgent(history, {
    phone: '8404 6973',
    email: 'ana@correo.com',
  })?.agent;

  // How LeadsManager asks: a lead carries one contact value.
  const leadsTab = historicalAgentForLead({ contact_value: 'ana@correo.com' }, history);

  assert.equal(customersTab, 'María');
  assert.equal(leadsTab, 'María');
  assert.equal(customersTab, leadsTab);
});

test('a customer is recognised however their number was typed', () => {
  const history = buildAgentHistory(twoAgentCustomer);
  for (const phone of ['+506 8404 6973', '50684046973', '8404-6973', '8404 6973']) {
    assert.equal(
      findHistoricalAgent(history, { phone })?.agent,
      'María',
      `phone format ${phone} should resolve to María`
    );
  }
});

test('an open order never assigns ownership', () => {
  const history = buildAgentHistory([
    {
      customer_name: 'Dani',
      customer_email: 'dani@correo.com',
      customer_phone: '+506 5000 3333',
      created_at: '2026-06-01',
      status: 'pending',
      sales_agent: 'María',
    },
  ]);
  assert.equal(findHistoricalAgent(history, { email: 'dani@correo.com' }), null);
});

test('one agent under both their name and their email is a single owner', () => {
  const profiles = [{ name: 'Korinne', email: 'korinneda@icloud.com' }];
  const resolveAgent = buildAgentNameResolver(profiles);
  const history = buildAgentHistory(
    [
      {
        customer_name: 'Eva',
        customer_email: 'eva@correo.com',
        customer_phone: '+506 7000 1234',
        created_at: '2026-01-02',
        status: 'Completed',
        sales_agent: 'korinneda@icloud.com',
      },
    ],
    { resolveAgent }
  );
  assert.equal(findHistoricalAgent(history, { email: 'eva@correo.com' })?.agent, 'Korinne');
});

test('a lead contact value is routed to the right key', () => {
  assert.deepEqual(contactKeysFor('whatsapp', '+506 8404 6973'), { phone: '+506 8404 6973', email: '' });
  assert.deepEqual(contactKeysFor('email', 'ana@correo.com'), { phone: '', email: 'ana@correo.com' });
  // The catalog gate takes one field for "WhatsApp or email", so plenty of
  // addresses arrive tagged as 'whatsapp'. The @ has to overrule the method.
  assert.deepEqual(contactKeysFor('whatsapp', 'ana@correo.com'), { phone: '', email: 'ana@correo.com' });
  assert.deepEqual(contactKeysFor('email', ''), { phone: '', email: '' });
});

test('a lead tagged whatsapp but holding an email still finds its agent', () => {
  const history = buildAgentHistory([
    {
      customer_name: 'Ana',
      customer_email: 'ana@correo.com',
      customer_phone: '+506 8404 6973',
      created_at: '2026-02-10',
      status: 'Completed',
      sales_agent: 'Mar\u00eda',
    },
  ]);
  const keys = contactKeysFor('whatsapp', 'ana@correo.com');
  assert.equal(findHistoricalAgent(history, keys)?.agent, 'Mar\u00eda');
});
