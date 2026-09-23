import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Until flash sales, exactly one deal could be live, and callers were written
 * to match: `.eq('status','live').maybeSingle()`. PostgREST turns two rows into
 * an error, so the day a flash sale started beside the weekly deal, product
 * saves threw and the WhatsApp bot silently forgot every offer.
 *
 * Any new caller that asks for the live deal must cope with more than one.
 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('nothing narrows the live deals to a single row', () => {
  const offenders = [];
  for (const file of walk('src')) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes("eq('status', 'live')")) continue;
    // The call chain, up to where the query is awaited.
    for (const match of source.matchAll(/\.eq\('status', 'live'\)([\s\S]{0,400}?);/g)) {
      const tail = match[1];
      if (/\.maybeSingle\(\)|\.single\(\)|\.limit\(1\)/.test(tail)) {
        offenders.push(`${file}: ${tail.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `these expect only one live deal:\n${offenders.join('\n')}`);
});
