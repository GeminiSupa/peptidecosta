/**
 * Gives every existing CRM lead back to the agent who first closed that
 * customer, matching on the same phone OR the same email as a past order.
 *
 * The WhatsApp ban wiped the chat history that told the sales team whose
 * customer was whose. The order book still knows, so ownership is rebuilt from
 * it here in one pass.
 *
 * Rules (set by the client, same as the live code path in
 * src/lib/agentAttribution.mjs):
 *   - the agent who closed the EARLIEST order keeps the customer
 *   - a lead that already has an owner is never touched
 *
 * DRY RUN BY DEFAULT — it prints what it would do and writes nothing.
 *
 *   node scripts/backfill-agent-attribution.mjs            # preview
 *   node scripts/backfill-agent-attribution.mjs --apply    # write
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

import {
  COMMISSION_ELIGIBLE_ORDER_STATUSES,
  buildAgentHistory,
  buildAgentNameResolver,
  findHistoricalAgent,
} from '../src/lib/agentAttribution.mjs';

const APPLY = process.argv.includes('--apply');
const PAGE = 1000;

const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim();
  return acc;
}, {});

const supabase = createClient(
  envConfig['NEXT_PUBLIC_SUPABASE_URL'],
  envConfig['SUPABASE_SERVICE_ROLE_KEY'],
);

/** Supabase caps a response at 1000 rows, so every read here is paginated. */
async function readAll(table, columns, refine = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await refine(
      supabase.from(table).select(columns).range(from, from + PAGE - 1),
    );
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function main() {
  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (nothing will be written) ===');

  const profiles = await readAll('admin_profiles', 'name, email');
  const resolveAgent = buildAgentNameResolver(profiles);

  const orders = await readAll(
    'orders',
    'sales_agent, status, created_at, customer_phone, customer_email',
    (query) => query.in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES),
  );
  const history = buildAgentHistory(orders, { resolveAgent });
  console.log(`Closed orders read: ${orders.length}`);
  console.log(`Customers with a known agent: ${history.size}\n`);

  if (history.size === 0) {
    console.log('No attributable order history found. Nothing to do.');
    return;
  }

  const leads = await readAll('catalog_leads', '*');
  console.log(`Leads read: ${leads.length}`);

  const ownerOf = (lead) => String(
    lead.sales_agent || lead.owner || lead.assigned_to || '',
  ).trim();

  const planned = [];
  let alreadyOwned = 0;
  let noMatch = 0;

  for (const lead of leads) {
    if (ownerOf(lead)) { alreadyOwned += 1; continue; }

    const value = lead.contact_value || '';
    const match = findHistoricalAgent(history, {
      phone: lead.phone || value,
      email: lead.email || value,
    });
    if (!match) { noMatch += 1; continue; }

    planned.push({ id: lead.id, contact: value, agent: match.agent });
  }

  const byAgent = planned.reduce((acc, row) => {
    acc[row.agent] = (acc[row.agent] || 0) + 1;
    return acc;
  }, {});

  console.log(`  already owned, left alone: ${alreadyOwned}`);
  console.log(`  no order history, skipped: ${noMatch}`);
  console.log(`  to attribute:              ${planned.length}\n`);

  for (const [agent, count] of Object.entries(byAgent).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${agent}`);
  }

  console.log('\nSample:');
  for (const row of planned.slice(0, 10)) {
    console.log(`  ${row.contact} -> ${row.agent}`);
  }

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write these.');
    return;
  }

  let written = 0;
  let failed = 0;
  for (const row of planned) {
    const { error } = await supabase
      .from('catalog_leads')
      .update({ sales_agent: row.agent })
      .eq('id', row.id);
    if (error) {
      failed += 1;
      // A missing column is fatal for every row, not just this one.
      if (/column .* does not exist/i.test(error.message)) {
        console.error(`\nSTOPPED: catalog_leads has no 'sales_agent' column.\n${error.message}`);
        break;
      }
      console.error(`  failed ${row.contact}: ${error.message}`);
    } else {
      written += 1;
    }
  }

  console.log(`\nWritten: ${written}   Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
