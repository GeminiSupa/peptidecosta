import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildChatwootLeadMessage,
  loadChatwootLeadEnabled,
  sendAdLeadToChatwoot,
} from '../src/lib/chatwootLead.mjs';

const ENV = {
  CHATWOOT_BASE_URL: 'https://chat.example.com/',
  CHATWOOT_ACCOUNT_ID: '12',
  CHATWOOT_INBOX_ID: '34',
  CHATWOOT_API_ACCESS_TOKEN: 'server-secret',
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('Google Ads lead message identifies both landing-page variant and CRM record', () => {
  const content = buildChatwootLeadMessage({
    leadId: 'lead-7', name: 'Ana', email: 'ana@example.com', phone: '50688887777',
    source: 'glp1_lp', qualificationLines: ['Interest: GLP-1'], campaign: 'google / cpc / weight',
  });
  assert.match(content, /\/glp-1/);
  assert.match(content, /Ana/);
  assert.match(content, /Interest: GLP-1/);
  assert.match(content, /CRM lead ID: lead-7/);
  assert.doesNotMatch(content, /CRM owner/);
});

test('missing Chatwoot environment skips delivery without making a network call', async () => {
  let called = false;
  const result = await sendAdLeadToChatwoot({
    leadId: 'lead-1', env: {}, fetchImpl: async () => { called = true; },
  });
  assert.deepEqual(result, { configured: false, sent: false });
  assert.equal(called, false);
});

test('the admin Chatwoot switch defaults on and honours an explicit off value', async () => {
  const fakeSupabase = (value, error = null) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: value === undefined ? null : { value }, error }),
    };
    return { from: () => query };
  };
  assert.equal(await loadChatwootLeadEnabled(fakeSupabase(undefined)), true);
  assert.equal(await loadChatwootLeadEnabled(fakeSupabase({ enabled: false })), false);
  assert.equal(await loadChatwootLeadEnabled(fakeSupabase({ enabled: true })), true);
});

test('the lead route and Team notification API share the admin Chatwoot switch', async () => {
  const [leadRoute, adminRoute, teamScreen] = await Promise.all([
    readFile(new URL('../src/app/api/leads/contact/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/admin/notification-recipients/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/TeamManagement.js', import.meta.url), 'utf8'),
  ]);
  assert.match(leadRoute, /loadChatwootLeadEnabled\(supabase\)/);
  assert.match(adminRoute, /CHATWOOT_LEAD_SETTING_ID/);
  assert.match(adminRoute, /chatwootEnabled/);
  assert.match(teamScreen, /Send Google Ads leads to Chatwoot/);
});

test('creates a contact, conversation and incoming message in the configured inbox', async () => {
  const calls = [];
  const replies = [
    response({ inbox_identifier: 'public-inbox-key' }),
    response({ id: 50, source_id: 'contact-source' }),
    response({ id: 60 }),
    response({ id: 70 }),
  ];
  const result = await sendAdLeadToChatwoot({
    leadId: 'lead-2', name: 'Omer test', email: 'omer@example.com', phone: '50684046973',
    source: 'adwords_lp', qualificationLines: ['Interest: Recovery'], env: ENV,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return replies.shift();
    },
  });

  assert.equal(result.sent, true);
  assert.equal(result.conversationId, 60);
  assert.equal(calls.length, 4);
  assert.match(calls[0].url, /\/api\/v1\/accounts\/12\/inboxes\/34$/);
  assert.equal(calls[0].options.headers.api_access_token, 'server-secret');
  assert.match(calls[1].url, /\/public\/api\/v1\/inboxes\/public-inbox-key\/contacts$/);
  assert.equal(JSON.parse(calls[1].options.body).identifier, 'google-ads-lead-lead-2');
  assert.equal(JSON.parse(calls[3].options.body).message_type, 'incoming');
  assert.match(JSON.parse(calls[3].options.body).content, /Omer test/);
});

test('assigns the chat to the Chatwoot agent with the CRM owner email', async () => {
  const calls = [];
  const replies = [
    response({ inbox_identifier: 'public-inbox-key' }),
    response({ id: 50, source_id: 'contact-source' }),
    response({ id: 60 }),
    response({ id: 70 }),
    response([{ id: 1, email: 'other@example.com' }, { id: 9, email: 'Pollita@Example.com' }]),
    response({ id: 9 }),
  ];
  const result = await sendAdLeadToChatwoot({
    leadId: 'lead-4', name: 'Ana', source: 'adwords_lp', assigneeEmail: 'pollita@example.com', env: ENV,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return replies.shift(); },
  });
  assert.equal(result.sent, true);
  assert.equal(result.assigneeId, 9);
  assert.match(calls[4].url, /\/api\/v1\/accounts\/12\/agents$/);
  assert.match(calls[5].url, /\/api\/v1\/accounts\/12\/conversations\/60\/assignments$/);
  assert.deepEqual(JSON.parse(calls[5].options.body), { assignee_id: 9 });
  assert.equal(calls[5].options.headers.api_access_token, 'server-secret');
});

test('an unknown assignee leaves the delivered chat unassigned and says why', async () => {
  const replies = [
    response({ inbox_identifier: 'public-inbox-key' }),
    response({ id: 50, source_id: 'contact-source' }),
    response({ id: 60 }),
    response({ id: 70 }),
    response([{ id: 1, email: 'other@example.com' }]),
  ];
  const result = await sendAdLeadToChatwoot({
    leadId: 'lead-5', assigneeEmail: 'missing@example.com', env: ENV,
    fetchImpl: async () => replies.shift(),
  });
  assert.equal(result.sent, true);
  assert.equal(result.assigneeId, null);
  assert.match(result.assignmentError, /missing@example\.com/);
});

test('returns a safe failure when Chatwoot rejects a request', async () => {
  const result = await sendAdLeadToChatwoot({
    leadId: 'lead-3', env: ENV,
    fetchImpl: async () => response({ message: 'Inbox unavailable' }, 503),
  });
  assert.deepEqual(result, { configured: true, sent: false, error: 'Inbox unavailable' });
  assert.doesNotMatch(JSON.stringify(result), /server-secret/);
});

test('only real international numbers are sent to Chatwoot as the contact phone', async () => {
  const { chatwootPhone } = await import('../src/lib/chatwootLead.mjs');
  assert.equal(chatwootPhone('50684046973'), '+50684046973');
  assert.equal(chatwootPhone('+1 (305) 555-0100'), '+13055550100');
  // Local formats Chatwoot rejects as "not e164" — the 2026-09-17 lost chat.
  assert.equal(chatwootPhone('03001234567'), '');
  assert.equal(chatwootPhone('1234567890123456'), '');
  assert.equal(chatwootPhone(''), '');
});

test('a phone Chatwoot refuses still opens the chat, without the phone on the contact', async () => {
  const calls = [];
  const replies = [
    response({ inbox_identifier: 'public-inbox-key' }),
    response({ message: 'Phone number should be in e164 format' }, 422),
    response({ payload: [] }),
    response({ id: 51, source_id: 'contact-source' }),
    response({ id: 61 }),
    response({ id: 71 }),
  ];
  const result = await sendAdLeadToChatwoot({
    leadId: 'lead-8', name: 'Ana', email: 'ana@example.com', phone: '50684046973', source: 'glp1_lp', env: ENV,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return replies.shift(); },
  });
  assert.equal(result.sent, true);
  assert.equal(result.conversationId, 61);
  const retry = JSON.parse(calls[3].options.body);
  assert.deepEqual(retry, { identifier: 'google-ads-lead-lead-8', name: 'Ana' });
  // The agent still gets the phone and email, in the message.
  assert.match(JSON.parse(calls[5].options.body).content, /50684046973/);
  assert.match(JSON.parse(calls[5].options.body).content, /ana@example\.com/);
});

test('a local-format phone is left off the contact instead of failing it', async () => {
  const calls = [];
  const replies = [
    response({ inbox_identifier: 'public-inbox-key' }),
    response({ id: 52, source_id: 'contact-source' }),
    response({ id: 62 }),
    response({ id: 72 }),
  ];
  const result = await sendAdLeadToChatwoot({
    leadId: 'lead-9', name: 'Ali', phone: '03001234567', source: 'adwords_lp', env: ENV,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return replies.shift(); },
  });
  assert.equal(result.sent, true);
  assert.equal(JSON.parse(calls[1].options.body).phone_number, undefined);
  assert.match(JSON.parse(calls[3].options.body).content, /03001234567/);
});
