import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildVisitorIdentityPatch, cleanLiveChatText, getLiveChatLeadContact, renderLiveChatMessage } from '../src/lib/liveChat.js';

test('a visitor with a cleared browser profile does not erase captured contact details', () => {
  assert.deepEqual(buildVisitorIdentityPatch({ name: null, email: null, phone: null }), {});
  assert.deepEqual(buildVisitorIdentityPatch({}), {});
  assert.deepEqual(buildVisitorIdentityPatch(), {});
});

test('visitor identity fields are written when the visitor actually supplies them', () => {
  assert.deepEqual(
    buildVisitorIdentityPatch({ name: 'Ana', email: 'ana@example.com', phone: null }),
    { visitor_name: 'Ana', visitor_email: 'ana@example.com' }
  );
});

test('live chat rendering hides rows that were stored as stringified objects', () => {
  assert.equal(renderLiveChatMessage('[object Object]'), '');
  assert.equal(renderLiveChatMessage('  [object Object]  '), '');
  assert.equal(renderLiveChatMessage('undefined'), '');
  assert.equal(renderLiveChatMessage(null), '');
  assert.equal(renderLiveChatMessage({ type: 'click' }), '');
});

test('live chat rendering keeps real messages intact', () => {
  assert.equal(renderLiveChatMessage('  Hola, ¿tienen stock?  '), 'Hola, ¿tienen stock?');
  assert.equal(renderLiveChatMessage('line one\nline two'), 'line one\nline two');
});

test('live chat text cleaner never stores event-like objects as messages', () => {
  assert.equal(cleanLiveChatText({ type: 'click' }), '');
  assert.equal(cleanLiveChatText({ toString: () => 'hola' }), '');
});

test('live chat text cleaner keeps normal typed messages', () => {
  assert.equal(cleanLiveChatText('  hola   mundo  '), 'hola mundo');
  assert.equal(cleanLiveChatText(12345), '12345');
});

test('live chat lead contact prefers email and keeps phone as secondary detail', () => {
  assert.deepEqual(
    getLiveChatLeadContact({ visitorEmail: ' Person@Example.com ', visitorPhone: '+506 6062 6224' }),
    {
      method: 'email',
      value: 'person@example.com',
      email: 'person@example.com',
      phone: '50660626224',
    }
  );
});

test('live chat lead contact falls back to phone when email is missing', () => {
  assert.deepEqual(
    getLiveChatLeadContact({ visitorPhone: '+506 6062 6224' }),
    {
      method: 'whatsapp',
      value: '50660626224',
      email: '',
      phone: '50660626224',
    }
  );
});
