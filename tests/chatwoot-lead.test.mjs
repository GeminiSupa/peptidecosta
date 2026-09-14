import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChatwootLeadMessage, sendAdLeadToChatwoot } from '../src/lib/chatwootLead.mjs';

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
});

test('missing Chatwoot environment skips delivery without making a network call', async () => {
  let called = false;
  const result = await sendAdLeadToChatwoot({
    leadId: 'lead-1', env: {}, fetchImpl: async () => { called = true; },
  });
  assert.deepEqual(result, { configured: false, sent: false });
  assert.equal(called, false);
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

test('returns a safe failure when Chatwoot rejects a request', async () => {
  const result = await sendAdLeadToChatwoot({
    leadId: 'lead-3', env: ENV,
    fetchImpl: async () => response({ message: 'Inbox unavailable' }, 503),
  });
  assert.deepEqual(result, { configured: true, sent: false, error: 'Inbox unavailable' });
  assert.doesNotMatch(JSON.stringify(result), /server-secret/);
});
