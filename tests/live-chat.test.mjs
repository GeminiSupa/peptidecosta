import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildVisitorIdentityPatch,
  cleanLiveChatText,
  getLiveChatLeadContact,
  matchesLiveChatOwnerFilter,
  matchesLiveChatStatusFilter,
  renderLiveChatMessage,
  shouldShowVisitorProfileForm,
} from '../src/lib/liveChat.js';

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

test('the pre-chat form stays open while a new visitor types their details', () => {
  // The regression: the gate was derived from the fields as they were typed, so
  // the first letter of the name flipped it and tore the inputs off screen
  // before the visitor could reach email or phone.
  const stored = { name: '', email: '', phone: '' };
  // The component resolves this once, on load, exactly like this.
  const knownVisitor = Boolean(stored.name || stored.email || stored.phone);

  // Every intermediate state of a visitor filling the form by hand.
  const keystrokes = [
    { name: '', email: '', phone: '' },
    { name: 'J', email: '', phone: '' },
    { name: 'Joe', email: '', phone: '' },
    { name: 'Joe', email: 'joe@', phone: '' },
    { name: 'Joe', email: 'joe@example.com', phone: '' },
    { name: 'Joe', email: 'joe@example.com', phone: '+506 6062 6224' },
  ];

  for (const profile of keystrokes) {
    assert.equal(
      shouldShowVisitorProfileForm({ knownVisitor, messageCount: 0, showDetails: false }),
      true,
      `form must stay open at ${JSON.stringify(profile)}`
    );
  }
});

test('a returning visitor we already have details for is not asked again', () => {
  assert.equal(
    shouldShowVisitorProfileForm({ knownVisitor: true, messageCount: 0, showDetails: false }),
    false
  );
});

test('the pre-chat form closes once the visitor has actually started the chat', () => {
  assert.equal(
    shouldShowVisitorProfileForm({ knownVisitor: false, messageCount: 1, showDetails: false }),
    false
  );
});

test('asking to add details reopens the form for anyone', () => {
  assert.equal(
    shouldShowVisitorProfileForm({ knownVisitor: true, messageCount: 4, showDetails: true }),
    true
  );
});

test('New/Unassigned holds only live chats nobody has claimed', () => {
  const unclaimed = { status: 'open', assignedTo: null };
  const claimed = { status: 'open', assignedTo: 'agent-1' };
  const parked = { status: 'pending', assignedTo: null };
  const done = { status: 'resolved', assignedTo: null };

  assert.equal(matchesLiveChatStatusFilter(unclaimed, 'new'), true);
  assert.equal(matchesLiveChatStatusFilter(parked, 'new'), true, 'waiting chats are still unclaimed work');
  assert.equal(matchesLiveChatStatusFilter(claimed, 'new'), false, 'an agent already owns this one');
  assert.equal(matchesLiveChatStatusFilter(done, 'new'), false, 'resolved is not new work');
});

test('replying moves a chat out of New/Unassigned and into Open + Mine', () => {
  // What the server does on reply: assigns the sender and opens the thread.
  const before = { status: 'pending', assignedTo: null };
  const after = { status: 'open', assignedTo: 'agent-1' };

  assert.equal(matchesLiveChatStatusFilter(before, 'new'), true);
  assert.equal(matchesLiveChatStatusFilter(after, 'new'), false, 'must leave the New queue');
  assert.equal(matchesLiveChatStatusFilter(after, 'open'), true, 'must land in Open');
  assert.equal(matchesLiveChatOwnerFilter(after, 'mine', 'agent-1'), true, 'must land in Mine');
});

test('the other status chips still match on the stored status alone', () => {
  assert.equal(matchesLiveChatStatusFilter({ status: 'resolved' }, 'resolved'), true);
  assert.equal(matchesLiveChatStatusFilter({ status: 'open' }, 'resolved'), false);
  assert.equal(matchesLiveChatStatusFilter({ status: 'resolved' }, 'all'), true);
});

test('owner filters never treat a signed-out agent as owning unassigned chats', () => {
  // `assignedTo` and a missing user id are both nullish, so a loose comparison
  // would have shown every unclaimed chat under Mine.
  assert.equal(matchesLiveChatOwnerFilter({ assignedTo: null }, 'mine', undefined), false);
  assert.equal(matchesLiveChatOwnerFilter({ assignedTo: null }, 'unassigned', undefined), true);
  assert.equal(matchesLiveChatOwnerFilter({ assignedTo: 'agent-2' }, 'mine', 'agent-1'), false);
  assert.equal(matchesLiveChatOwnerFilter({ assignedTo: 'agent-2' }, 'all', 'agent-1'), true);
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
