import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listAccountConversations,
  loadConversationMessages,
  normalizeChatwootStatus,
  sendConversationReply,
} from '../src/lib/chatwootConversations.mjs';

const ENV = {
  CHATWOOT_BASE_URL: 'https://chat.example.com/',
  CHATWOOT_ACCOUNT_ID: '12',
  CHATWOOT_API_ACCESS_TOKEN: 'server-secret',
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// A fake Chatwoot: one conversation of 25 messages, so the history has to be
// read across two pages.
function fakeChatwoot() {
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
    if (pathname === '/api/v1/accounts/12/conversations') {
      return response({
        data: {
          payload: [{
            id: 99,
            status: 'snoozed',
            meta: { assignee: { name: 'Dani' }, sender: { name: 'Ana', identifier: 'google-ads-lead-11111111-2222-3333-4444-555555555555' } },
            last_activity_at: 1_700_000_100,
            messages: [{ content: 'last one' }],
          }],
        },
      });
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

test('the inbox lists the account conversations with status and contact', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  const result = await listAccountConversations({ env: ENV, fetchImpl });
  assert.equal(result.configured, true);
  assert.equal(result.conversations.length, 1);
  const [conversation] = result.conversations;
  assert.equal(conversation.status, 'snoozed');
  assert.equal(conversation.contactName, 'Ana');
  assert.equal(conversation.assigneeName, 'Dani');
  assert.equal(conversation.lastMessage, 'last one');
  assert.equal(conversation.url, 'https://chat.example.com/app/accounts/12/conversations/99');
  assert.doesNotMatch(calls[0].url, /status=/, 'no status filter asks for everything');
});

test('a status filter is passed through, and an invented one is ignored', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  await listAccountConversations({ status: 'PENDING', env: ENV, fetchImpl });
  assert.match(calls[0].url, /status=pending/);

  const second = fakeChatwoot();
  await listAccountConversations({ status: 'nonsense', env: ENV, fetchImpl: second.fetchImpl });
  assert.doesNotMatch(second.calls[0].url, /status=/);
});

test('a later page is asked for by number, and junk falls back to page 1', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  await listAccountConversations({ page: 3, env: ENV, fetchImpl });
  assert.match(calls[0].url, /page=3/);

  const second = fakeChatwoot();
  await listAccountConversations({ page: 'abc', env: ENV, fetchImpl: second.fetchImpl });
  assert.match(second.calls[0].url, /page=1/);
});

test('the full history is read across pages, oldest first', async () => {
  const { fetchImpl } = fakeChatwoot();
  const result = await loadConversationMessages({ conversationId: 99, env: ENV, fetchImpl });
  assert.equal(result.messages.length, 25);
  assert.equal(result.messages[0].content, 'm1');
  assert.equal(result.messages[0].kind, 'incoming');
  assert.equal(result.messages[1].kind, 'outgoing');
});

test('missing Chatwoot settings report not configured without calling out', async () => {
  let called = false;
  const result = await listAccountConversations({
    env: {}, fetchImpl: async () => { called = true; return response({}); },
  });
  assert.equal(result.configured, false);
  assert.equal(called, false);
});

test('a reply is posted as a public outgoing message', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  const message = await sendConversationReply({ conversationId: '99', content: '  Hola Ana  ', env: ENV, fetchImpl });
  const post = calls.find((call) => call.options.method === 'POST');
  assert.deepEqual(JSON.parse(post.options.body), { content: 'Hola Ana', message_type: 'outgoing', private: false });
  assert.equal(message.content, 'Hola Ana');
  assert.equal(message.kind, 'outgoing');
});

test('an empty reply is refused before anything is sent', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  await assert.rejects(
    sendConversationReply({ conversationId: '99', content: '   ', env: ENV, fetchImpl }),
    (error) => error.status === 400,
  );
  assert.equal(calls.length, 0);
});

test('a reply with no conversation is refused', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  await assert.rejects(
    sendConversationReply({ conversationId: '', content: 'hi', env: ENV, fetchImpl }),
    (error) => error.status === 400,
  );
  assert.equal(calls.length, 0);
});

test('unknown statuses fall back to open', () => {
  assert.equal(normalizeChatwootStatus('RESOLVED'), 'resolved');
  assert.equal(normalizeChatwootStatus('pending'), 'pending');
  assert.equal(normalizeChatwootStatus(''), 'open');
});
