import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ALL_ORDER_AGENTS,
  UNASSIGNED_ORDER_AGENT,
  orderAgentFilterOptions,
  orderAgentFilterValue,
  orderMatchesAgentFilter,
} from '../src/lib/orderAgentFilter.mjs';

const manager = await readFile(
  new URL('../src/components/admin/OrdersManager.js', import.meta.url),
  'utf8',
);

test('agent filters combine exact ownership with an unassigned queue', () => {
  const joe = { sales_agent: 'Joe' };
  const unassigned = { sales_agent: null };

  assert.equal(orderMatchesAgentFilter(joe, ALL_ORDER_AGENTS), true);
  assert.equal(orderMatchesAgentFilter(joe, orderAgentFilterValue('joe')), true);
  assert.equal(orderMatchesAgentFilter(joe, orderAgentFilterValue('Jane')), false);
  assert.equal(orderMatchesAgentFilter(unassigned, UNASSIGNED_ORDER_AGENT), true);
  assert.equal(orderMatchesAgentFilter(joe, UNASSIGNED_ORDER_AGENT), false);
});

test('the dropdown keeps active, current, and historical agent values without duplicates', () => {
  const options = orderAgentFilterOptions(
    ['Joe', 'Ana'],
    [{ sales_agent: 'joe' }, { sales_agent: 'legacy@example.com' }],
    'Korinne',
  );

  assert.deepEqual(options.map((option) => option.label), [
    'Ana',
    'Joe',
    'Korinne',
    'legacy@example.com',
  ]);
});

test('Orders exposes a labeled agent dropdown and resets pagination when it changes', () => {
  assert.match(manager, /aria-label="Filter orders by agent"/);
  assert.match(manager, />All Agents</);
  assert.match(manager, />Unassigned</);
  assert.match(manager, /setOrderAgentFilter\(e\.target\.value\);\s*setOrdersCurrentPage\(1\)/);
  assert.match(manager, /orderMatchesAgentFilter\(order, orderAgentFilter\)/);
});
