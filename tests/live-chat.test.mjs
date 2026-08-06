import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanLiveChatText, getLiveChatLeadContact } from '../src/lib/liveChat.js';

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
