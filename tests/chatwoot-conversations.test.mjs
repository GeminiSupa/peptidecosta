import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chatwootLeadIdentifier,
  loadLeadChatwootConversations,
  normalizeChatwootStatus,
  sendLeadChatwootReply,
} from '../src/lib/chatwootConversations.mjs';

const ENV = {
  CHATWOOT_BASE_URL: 'https://chat.example.com/',
  CHATWOOT_ACCOUNT_ID: '12',
  CHATWOOT_API_ACCESS_TOKEN: 'server-secret',
};
const LEAD = { id: '11111111-2222-3333-4444-555555555555', chatwoot_contact_id: null };

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// A fake Chatwoot: one contact with one conversation of 25 messages, so the
// history has to be read across two pages.
function fakeChatwoot({ contacts = [{ id: 7, identifier: chatwootLeadIdentifier(LEAD.id) }] } = {}) {
  const calls = [];
  const messages = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    content: `m${index + 1}`,
    message_type: index % 2,
    created_at: 1_700_000_000 + index,
    sender: { name: index % 2 ? 'Dani' : 'Ana' },
  }));
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    assert.equal(options.headers.api_access_token, 'server-secret');
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/api/v1/accounts/12/contacts/search') return response({ payload: contacts });
    if (pathname === '/api/v1/accounts/12/contacts/7/conversations') {
      return response({ payload: [{ id: 99, status: 'snoozed', meta: { assignee: { name: 'Dani' } }, last_activity_at: 1_700_000_100 }] });
    }
    if (pathname === '/api/v1/accounts/12/conversations/99/messages' && options.method === 'POST') {
      return response({ id: 500, content: JSON.parse(options.body).content, message_type: 1, created_at: 1_700_000_200 });
    }
    if (pathname === '/api/v1/accounts/12/conversations/99/messages') {
      const before = Number(searchParams.get('before')) || Infinity;
      return response({ payload: messages.filter((m) => m.id < before).slice(-20) });
    }
    return response({}, 404);
  };
  return { calls, fetchImpl };
}

test('conversations are found through the identifier the lead was sent with', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  const result = await loadLeadChatwootConversations({ lead: LEAD, env: ENV, fetchImpl });
  assert.match(calls[0].url, /contacts\/search\?q=google-ads-lead-11111111/);
  assert.equal(result.contactId, 7);
  assert.equal(result.conversations.length, 1);
  const [conversation] = result.conversations;
  assert.equal(conversation.status, 'snoozed');
  assert.equal(conversation.assigneeName, 'Dani');
  assert.equal(conversation.url, 'https://chat.example.com/app/accounts/12/conversations/99');
  assert.equal(conversation.messages.length, 25, 'the full history spans both pages');
  assert.equal(conversation.messages[0].content, 'm1');
  assert.equal(conversation.messages[0].kind, 'incoming');
  assert.equal(conversation.messages[1].kind, 'outgoing');
});

test('a lead with no Chatwoot contact returns an empty list', async () => {
  const { fetchImpl } = fakeChatwoot({ contacts: [] });
  const result = await loadLeadChatwootConversations({ lead: LEAD, env: ENV, fetchImpl });
  assert.deepEqual(result, { configured: true, contactId: null, conversations: [] });
});

test('the stored contact ID is used when the identifier search finds nothing', async () => {
  const { fetchImpl } = fakeChatwoot({ contacts: [] });
  const result = await loadLeadChatwootConversations({
    lead: { ...LEAD, chatwoot_contact_id: 7 }, env: ENV, fetchImpl,
  });
  assert.equal(result.conversations.length, 1);
});

test('a contact whose identifier only partly matches is not used', async () => {
  const { fetchImpl } = fakeChatwoot({ contacts: [{ id: 7, identifier: `${chatwootLeadIdentifier(LEAD.id)}-x` }] });
  const result = await loadLeadChatwootConversations({ lead: LEAD, env: ENV, fetchImpl });
  assert.equal(result.contactId, null);
});

test('missing Chatwoot settings report not configured without calling out', async () => {
  let called = false;
  const result = await loadLeadChatwootConversations({
    lead: LEAD, env: {}, fetchImpl: async () => { called = true; return response({}); },
  });
  assert.equal(result.configured, false);
  assert.equal(called, false);
});

test('a reply is posted as a public outgoing message', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  const message = await sendLeadChatwootReply({ lead: LEAD, conversationId: '99', content: '  Hola Ana  ', env: ENV, fetchImpl });
  const post = calls.find((call) => call.options.method === 'POST');
  assert.deepEqual(JSON.parse(post.options.body), { content: 'Hola Ana', message_type: 'outgoing', private: false });
  assert.equal(message.content, 'Hola Ana');
  assert.equal(message.kind, 'outgoing');
});

test('a reply to a conversation of another contact is refused', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  await assert.rejects(
    sendLeadChatwootReply({ lead: LEAD, conversationId: '1234', content: 'hi', env: ENV, fetchImpl }),
    (error) => error.status === 404,
  );
  assert.equal(calls.some((call) => call.options.method === 'POST'), false);
});

test('an empty reply is refused before anything is sent', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  await assert.rejects(
    sendLeadChatwootReply({ lead: LEAD, conversationId: '99', content: '   ', env: ENV, fetchImpl }),
    (error) => error.status === 400,
  );
  assert.equal(calls.length, 0);
});

test('unknown statuses fall back to open', () => {
  assert.equal(normalizeChatwootStatus('RESOLVED'), 'resolved');
  assert.equal(normalizeChatwootStatus('pending'), 'pending');
  assert.equal(normalizeChatwootStatus(''), 'open');
});
