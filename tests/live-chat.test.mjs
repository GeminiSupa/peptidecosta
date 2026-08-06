import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanLiveChatText } from '../src/lib/liveChat.js';

test('live chat text cleaner never stores event-like objects as messages', () => {
  assert.equal(cleanLiveChatText({ type: 'click' }), '');
  assert.equal(cleanLiveChatText({ toString: () => 'hola' }), '');
});

test('live chat text cleaner keeps normal typed messages', () => {
  assert.equal(cleanLiveChatText('  hola   mundo  '), 'hola mundo');
  assert.equal(cleanLiveChatText(12345), '12345');
});
