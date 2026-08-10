/**
 * RETIRED — do not run. Kept only so the commit history reads.
 *
 * This codemod flipped CustomersCRM from first-closed-order attribution to
 * LAST-closed-order attribution. That decision has since been reversed: the
 * rule is "the agent who won them owns them", i.e. the agent on the customer's
 * EARLIEST closed order, and it now lives in one place —
 * src/lib/agentAttribution.mjs — which both the Customers tab and the Leads tab
 * call. Running this again would re-introduce the divergence it caused, where
 * a customer with two closed orders by different agents showed one agent in the
 * Customers tab and another in the Leads tab.
 *
 * It was also unsafe. The block it rewrote was matched with
 *
 *     /if \(orderTime > map\[id\]\.lastClosedOrderDate\) \{[\s\S]*?\}/
 *
 * and `[\s\S]*?}` is non-greedy, so it stopped at the closing brace of the
 * inner `if (o.sales_agent) { ... }`. It swapped a partial block for a complete
 * one, orphaning the outer `}`. Because src/app/admin/page.js imports every CRM
 * component, that single brace took the WHOLE /admin route to a 500 — not just
 * the Customers tab. Each re-run duplicated the `else if` branch as well.
 *
 * The code it targeted no longer exists, so there is nothing left to patch.
 */

console.error(
  [
    'patch_crm.js is retired and does nothing.',
    '',
    'Customer→agent ownership now lives in src/lib/agentAttribution.mjs',
    '(earliest closed order wins) and is shared by CustomersCRM and',
    'LeadsManager. Change the rule there, with a test in',
    'tests/agent-attribution.test.mjs — not with a regex codemod.',
  ].join('\n')
);
process.exit(1);
