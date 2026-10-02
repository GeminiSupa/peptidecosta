import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Checkout calls these to attach a signed-in customer to the order.
 * The import was removed while the calls stayed, so every catalog
 * order threw "Internal server error" before it was saved.
 */
test('order create still imports the customer-ownership helpers it calls', () => {
  const source = fs.readFileSync('src/app/api/orders/create/route.js', 'utf8');
  assert.match(
    source,
    /import\s*\{[^}]*\bresolveCustomerOrderOwner\b[^}]*\}\s*from\s*['"]@\/lib\/customerOrderOwnership\.mjs['"]/,
  );
  assert.match(source, /\bapplyCustomerOrderOwnership\b/);
  assert.match(source, /\bCustomerSessionError\b/);
});
