/**
 * Recomputes fit_score for prospects already in the pipeline.
 *
 * The score is written when a row is saved, never when it is read, so the
 * commercial tiers added in src/lib/prospectCategories.mjs — and the accent
 * fix in flattenCategory that finally lets 'clinica' match "Clínica" — reach
 * existing rows only if something rewrites them. That is this.
 *
 * It refuses to lower a score. The tier points were chosen so tier 5 keeps the
 * 45 every target category scored before, which means a rescore should only
 * ever lift a prospect. If that stops being true the model has changed in a
 * way nobody intended, and the run stops rather than quietly demoting a
 * business a salesperson is in the middle of working.
 *
 * DRY RUN BY DEFAULT — it prints what it would do and writes nothing.
 *
 *   node scripts/rescore-prospects.mjs                  # preview
 *   node scripts/rescore-prospects.mjs --apply          # write
 *   node scripts/rescore-prospects.mjs --allow-lower    # accept demotions too
 *
 * --allow-lower exists for one specific case: a row whose stored score predates
 * an earlier, deliberate change to the model. scoreProspect used to count
 * phone, email and permission, and now scores commercial fit alone — so a row
 * saved before that change reads high for reasons the model no longer holds.
 * Lowering it is a correction, but it is one a person should choose, because
 * from a salesperson's side it is their prospect getting worse overnight.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

import { scoreProspect } from '../src/lib/prospects.mjs';
import { categoryTier } from '../src/lib/prospectCategories.mjs';

const APPLY = process.argv.includes('--apply');
const ALLOW_LOWER = process.argv.includes('--allow-lower');
const PAGE = 1000;

const envPath = path.resolve(process.cwd(), '.env.local');
const env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Only what scoreProspect reads, plus what a human needs to recognise the row.
const FIELDS = [
  'id', 'organization_name', 'category', 'website_url', 'city', 'region',
  'formatted_address', 'business_status', 'rating', 'user_rating_count',
  'fit_score', 'status',
].join(',');

async function readAll() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('sales_prospects')
      .select(FIELDS)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Read failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function run() {
  const rows = await readAll();
  console.log(`${rows.length} prospects in the pipeline\n`);

  const changes = [];
  const demotions = [];
  for (const row of rows) {
    const scored = scoreProspect(row);
    if (scored.score === row.fit_score) continue;
    const change = {
      id: row.id,
      name: row.organization_name,
      category: row.category,
      tier: categoryTier(row.category),
      from: row.fit_score,
      to: scored.score,
      reasons: scored.reasons,
    };
    (scored.score < row.fit_score ? demotions : changes).push(change);
  }

  if (demotions.length && !ALLOW_LOWER) {
    console.error(`REFUSING TO RUN: ${demotions.length} prospect(s) would score LOWER than they do now.`);
    console.error('The tiers were built so a rescore can only lift, so this is something else —');
    console.error('most likely a score stored before scoreProspect dropped contact details from');
    console.error('the model. Read the rows, then re-run with --allow-lower to accept it:\n');
    for (const d of demotions.slice(0, 10)) {
      console.error(`  ${d.from} -> ${d.to}  ${d.name} (${d.category || 'no category'})`);
    }
    process.exitCode = 1;
    return;
  }
  if (demotions.length) {
    console.log(`${demotions.length} prospect(s) will be LOWERED (--allow-lower):\n`);
    for (const d of demotions.slice(0, 20)) {
      console.log(`  ${d.from} -> ${d.to}  ${d.name} (${d.category || 'no category'})`);
    }
    console.log('');
    changes.push(...demotions);
  }

  if (!changes.length) {
    console.log('Every prospect already carries its current score. Nothing to do.');
    return;
  }

  const byTier = {};
  for (const c of changes) {
    const key = c.tier ? `tier ${c.tier}` : 'free text';
    byTier[key] = byTier[key] || { n: 0, lift: 0 };
    byTier[key].n += 1;
    byTier[key].lift += c.to - c.from;
  }

  console.log(`${changes.length} prospect(s) would change:\n`);
  for (const [key, v] of Object.entries(byTier).sort()) {
    const mean = v.lift / v.n;
    console.log(`  ${key.padEnd(11)} ${String(v.n).padStart(5)} rows, average ${mean >= 0 ? '+' : ''}${mean.toFixed(1)}`);
  }

  const biggest = [...changes]
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, 12);
  console.log('\nBiggest moves:');
  for (const c of biggest) {
    console.log(`  ${String(c.from).padStart(3)} -> ${String(c.to).padStart(3)}  ${String(c.name).slice(0, 44).padEnd(44)} ${c.category || ''}`);
  }

  if (!APPLY) {
    console.log('\nDry run. Nothing written. Re-run with --apply to write these scores.');
    return;
  }

  console.log('\nWriting…');
  let written = 0;
  for (const c of changes) {
    // One row at a time: an upsert would need every column, and rewriting
    // columns this script never read is how a backfill destroys data it was
    // not asked to touch.
    const { error } = await supabase
      .from('sales_prospects')
      .update({ fit_score: c.to, fit_reasons: c.reasons })
      .eq('id', c.id);
    if (error) {
      console.error(`  failed ${c.name}: ${error.message}`);
      continue;
    }
    written += 1;
    if (written % 100 === 0) console.log(`  ${written}/${changes.length}`);
  }
  console.log(`\nDone. ${written} prospect(s) rescored.`);
}

run().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
