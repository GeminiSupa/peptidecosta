import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildChatwootLeadUpdates,
  chatwootCrmNotification,
  leadIdFromChatwootEvent,
  normalizeChatwootEvent,
  verifyChatwootSignature,
} from '../src/lib/chatwootWebhook.mjs';

const LEAD_ID = '123e4567-e89b-42d3-a456-426614174000';

test('verifies Chatwoot HMAC over timestamp and the untouched raw body', () => {
  const rawBody = '{"event":"message_created","content":"hola"}';
  const timestamp = '1789876800';
  const secret = 'webhook-secret';
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  assert.equal(verifyChatwootSignature({ rawBody, signature, timestamp, secret, nowMs: 1789876800 * 1000 }), true);
  assert.equal(verifyChatwootSignature({ rawBody: `${rawBody} `, signature, timestamp, secret, nowMs: 1789876800 * 1000 }), false);
  assert.equal(verifyChatwootSignature({ rawBody, signature, timestamp, secret, nowMs: (1789876800 + 301) * 1000 }), false);
});

test('normalizes message payloads and recovers the CRM lead id from the seed message', () => {
  const event = normalizeChatwootEvent({
    event: 'message_created',
    id: 77,
    content: `New Google Ads lead\nCRM lead ID: ${LEAD_ID}`,
    message_type: 'incoming',
    created_at: 1789876800,
    sender: { id: 8, type: 'contact', name: 'Ana' },
    inbox: { id: 34 },
    account: { id: 12 },
    conversation: { id: 60, inbox_id: 34, status: 'open' },
  });
  assert.equal(event.direction, 'inbound');
  assert.equal(event.conversationId, 60);
  assert.equal(event.contactId, 8);
  assert.equal(event.occurredAt, '2026-09-20T04:00:00.000Z');
  assert.equal(leadIdFromChatwootEvent(event), LEAD_ID);
});

test('an agent reply marks the CRM lead contacted and records first-response analytics', () => {
  const event = normalizeChatwootEvent({
    event: 'message_created', id: 78, content: 'How can I help?', message_type: 1,
    created_at: '2026-09-20T12:05:00.000Z', private: false,
    sender: { id: 9, type: 'user', name: 'Pollita', email: 'pollita@example.com' },
    account: { id: 12 }, inbox: { id: 34 },
    conversation: {
      id: 60, inbox_id: 34, status: 'open',
      meta: { assignee: { name: 'Pollita', email: 'pollita@example.com' } },
    },
  });
  const updates = buildChatwootLeadUpdates(event, {
    id: LEAD_ID, created_at: '2026-09-20T12:00:00.000Z', chatwoot_message_count: 1,
  }, '2026-09-20T12:05:01.000Z');
  assert.equal(updates.chatwoot_message_count, 2);
  assert.equal(updates.chatwoot_first_response_seconds, 300);
  assert.equal(updates.last_contacted_at, '2026-09-20T12:05:00.000Z');
  assert.equal(updates.sales_agent, 'Pollita');
});

test('incoming customer messages create a targeted CRM bell notification, but the seed does not', () => {
  const incoming = normalizeChatwootEvent({
    event: 'message_created', id: 79, content: 'I have another question', message_type: 'incoming',
    created_at: '2026-09-20T12:07:00.000Z', private: false,
    sender: { id: 8, type: 'contact', name: 'Ana' },
    account: { id: 12 }, inbox: { id: 34 },
    conversation: { id: 60, inbox_id: 34, status: 'open' },
  });
  const notification = chatwootCrmNotification(
    { ...incoming, assigneeEmail: 'pollita@example.com' },
    { id: LEAD_ID, name: 'Ana' },
    'delivery-79',
  );
  assert.equal(notification.recipient_email, 'pollita@example.com');
  assert.match(notification.title, /Chatwoot message/);
  const seed = { ...incoming, content: `CRM lead ID: ${LEAD_ID}` };
  assert.equal(chatwootCrmNotification(seed, { id: LEAD_ID, name: 'Ana' }, 'delivery-seed'), null);
});

test('the route is signature-gated and the migration keeps an idempotent event ledger', async () => {
  const [route, migration] = await Promise.all([
    readFile(new URL('../src/app/api/webhooks/chatwoot/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../chatwoot-crm-sync-migration.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /CHATWOOT_WEBHOOK_SECRET/);
  assert.match(route, /x-chatwoot-signature/);
  assert.match(route, /x-chatwoot-delivery/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.chatwoot_events/);
  assert.match(migration, /event_key TEXT NOT NULL UNIQUE/);
});
