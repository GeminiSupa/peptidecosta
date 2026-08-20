import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { hasWhatsAppOptIn, isWhatsAppSuppressed } from '../src/lib/whatsappCompliance.js';

const sendRoute = await readFile(
  new URL('../src/app/api/admin/prospects/outreach/send/route.js', import.meta.url),
  'utf8',
);
const manager = await readFile(
  new URL('../src/components/admin/ProspectorManager.js', import.meta.url),
  'utf8',
);

function failingSupabase() {
  const query = {
    select: () => query,
    eq: () => query,
    ilike: () => query,
    in: () => query,
    limit: async () => ({ data: null, error: new Error('database offline') }),
  };
  return { from: () => query };
}

test('WhatsApp compliance lookups fail safely on returned database errors', async () => {
  assert.equal(await hasWhatsAppOptIn(failingSupabase(), '+506 8888 7777'), false);
  assert.equal(await isWhatsAppSuppressed(failingSupabase(), '+506 8888 7777'), true);
});

test('a WhatsApp handoff returns before sent history and contact status updates', () => {
  const handoffBranch = sendRoute.indexOf("if (outreachChannel === 'whatsapp')");
  const handoffReturn = sendRoute.indexOf('return NextResponse.json({', handoffBranch);
  const sentLog = sendRoute.indexOf("status: 'sent'", handoffBranch);
  const contactUpdate = sendRoute.indexOf('prospectUpdatesForSend', handoffBranch);
  assert.ok(handoffBranch >= 0 && handoffReturn > handoffBranch);
  assert.ok(sentLog > handoffReturn, 'sent history must only happen after the WhatsApp return');
  assert.ok(contactUpdate > handoffReturn, 'contact status must only happen after the WhatsApp return');
});

test('the UI keeps a direct WhatsApp link when a popup is blocked', () => {
  assert.match(manager, /setWhatsappHandoffUrl\(payload\.handoffUrl\)/);
  assert.match(manager, /Your browser blocked the WhatsApp window/);
  assert.match(manager, /Open WhatsApp message/);
});

test('history errors are distinct from a genuinely empty history', () => {
  assert.match(manager, /history\.error/);
  assert.match(manager, /Unable to load outreach history/);
  assert.match(manager, /!history\.error && !history\.rows\.length/);
});
