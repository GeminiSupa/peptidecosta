import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_LIVE_CHAT_DIAL_CODE,
  LIVE_CHAT_DIAL_CODES,
  buildVisitorIdentityPatch,
  canStartLiveChat,
  cleanLiveChatText,
  composeLiveChatPhone,
  dialCodeLabel,
  isUsableEmail,
  isUsablePhone,
  missingLiveChatContact,
  splitLiveChatPhone,
  getLiveChatLeadContact,
  matchesLiveChatOwnerFilter,
  matchesLiveChatStatusFilter,
  renderLiveChatMessage,
  shouldShowVisitorProfileForm,
} from '../src/lib/liveChat.js';

test('a chat cannot start without a name and a way to reply', () => {
  assert.deepEqual(missingLiveChatContact({ name: 'Ana', email: 'ana@example.com' }), []);
  assert.deepEqual(missingLiveChatContact({ name: 'Ana', phone: '+506 6062 6224' }), [], 'phone alone is enough');
  assert.deepEqual(missingLiveChatContact({ name: 'Ana' }), ['contact'], 'a name with no way to reply back');
  assert.deepEqual(missingLiveChatContact({ email: 'ana@example.com' }), ['name']);
  assert.deepEqual(missingLiveChatContact({}), ['name', 'contact']);
  assert.deepEqual(missingLiveChatContact(), ['name', 'contact'], 'no profile at all');

  assert.equal(canStartLiveChat({ name: 'Ana', phone: '60626224' }), true);
  assert.equal(canStartLiveChat({ name: '   ', email: 'ana@example.com' }), false, 'spaces are not a name');
  // A country code typed into the number box without a "+" is not stripped:
  // Costa Rican local numbers can themselves begin 506, so guessing would eat
  // real digits. Eleven digits is not a CR number, and is rejected.
  assert.equal(canStartLiveChat({ name: 'Ana', phone: '50660626224' }), false);
});

test('a contact detail has to be one somebody could actually answer', () => {
  // The point of the requirement is a reachable lead, so "a" in the email box
  // must not satisfy it — that leaves the CRM holding a chat nobody can reply to.
  assert.deepEqual(missingLiveChatContact({ name: 'Ana', email: 'a' }), ['contact']);
  assert.deepEqual(missingLiveChatContact({ name: 'Ana', phone: '123' }), ['contact'], 'too short to be a number');

  for (const email of ['ana@example.com', 'ana.lopez+chat@sub.example.co.cr', 'A@B.CR']) {
    assert.equal(isUsableEmail(email), true, email);
  }
  for (const email of ['', 'ana', 'ana@', '@example.com', 'ana@example', 'ana @example.com', null, undefined]) {
    assert.equal(isUsableEmail(email), false, JSON.stringify(email));
  }

  // Real people type numbers every which way; all of these are the same number,
  // and nobody should be turned away over a dash or a space.
  for (const phone of ['+506 6062 6224', '+506 6062-6224', '+506 6062.6224', '+50660626224', '60626224']) {
    assert.equal(isUsablePhone(phone), true, phone);
  }
  for (const phone of ['', '12345', 'call me', '+', null, undefined]) {
    assert.equal(isUsablePhone(phone), false, JSON.stringify(phone));
  }
});

test('the country code is not counted as part of the number', () => {
  // "+506 1234" is seven digits, but only four of them are a phone number.
  assert.equal(isUsablePhone('+506 1234'), false, 'the country code must not pad the length');
  assert.equal(isUsablePhone('+506'), false, 'a country on its own is not a number');
});

test('a Costa Rican number has to be all eight digits', () => {
  assert.equal(isUsablePhone('+506 6062 6224'), true);
  assert.equal(isUsablePhone('+506 606 6224'), false, 'seven digits is a typo, not a CR number');
  assert.equal(isUsablePhone('+506 6062 62240'), false, 'nine digits is a typo too');
  // The North American plan is a fixed ten.
  assert.equal(isUsablePhone('+1 305 555 0143'), true);
  assert.equal(isUsablePhone('+1 305 555 014'), false);
  // A country with no fixed length set keeps the seven-digit floor rather than
  // being guessed at.
  assert.equal(isUsablePhone('+44 7700 900123'), true);
  assert.equal(isUsablePhone('+44 7700'), false);
});

test('the country picker and the stored number agree on where the code ends', () => {
  assert.deepEqual(splitLiveChatPhone('+506 6062 6224'), { dialCode: '+506', localNumber: '6062 6224' });
  // +506 must win over +5 and +50, which is why the codes are matched longest
  // first — otherwise Costa Rican numbers would keep an orphan "06" up front.
  assert.deepEqual(splitLiveChatPhone('+50660626224').dialCode, '+506');
  assert.deepEqual(splitLiveChatPhone('+1 3055550143'), { dialCode: '+1', localNumber: '3055550143' });
  // A number saved before the picker existed is a bare local one, and belongs
  // to the default country, which is what it was.
  assert.deepEqual(splitLiveChatPhone('60626224'), { dialCode: DEFAULT_LIVE_CHAT_DIAL_CODE, localNumber: '60626224' });
  assert.deepEqual(splitLiveChatPhone(''), { dialCode: DEFAULT_LIVE_CHAT_DIAL_CODE, localNumber: '' });
});

test('the number stored against a lead carries its country code', () => {
  assert.equal(composeLiveChatPhone('+506', '6062 6224'), '+506 6062 6224');
  assert.equal(composeLiveChatPhone('+1', '3055550143'), '+1 3055550143');
  // An empty box is no number at all: a bare "+506" in the CRM would read as
  // one and be dialled as one.
  assert.equal(composeLiveChatPhone('+506', ''), '');
  assert.equal(composeLiveChatPhone('+506', '   '), '');
  // A visitor who types the code themselves is not given it twice.
  assert.equal(composeLiveChatPhone('+506', '+1 3055550143'), '+1 3055550143');
  // An unknown country falls back rather than writing junk into the number.
  assert.equal(composeLiveChatPhone('+999', '6062 6224'), '+506 6062 6224');
  assert.equal(composeLiveChatPhone(undefined, '6062 6224'), '+506 6062 6224');

  // Round trip: what is composed splits back to what it came from.
  for (const entry of LIVE_CHAT_DIAL_CODES) {
    const composed = composeLiveChatPhone(entry.code, '60626224');
    assert.deepEqual(splitLiveChatPhone(composed), { dialCode: entry.code, localNumber: '60626224' }, entry.code);
  }
});

test('the country list speaks the language the widget is in', () => {
  // The widget runs in Spanish by default, so an English-only country list was
  // the one place the language slipped mid-form.
  for (const entry of LIVE_CHAT_DIAL_CODES) {
    assert.ok(entry.label, `${entry.code} has no English name`);
    assert.ok(entry.labelEs, `${entry.code} has no Spanish name`);
    assert.equal(dialCodeLabel(entry, 'en'), entry.label);
    assert.equal(dialCodeLabel(entry, 'es'), entry.labelEs);
  }

  const mexico = LIVE_CHAT_DIAL_CODES.find((entry) => entry.code === '+52');
  assert.equal(dialCodeLabel(mexico, 'es'), 'México');
  assert.equal(dialCodeLabel(mexico, 'en'), 'Mexico');
  // Anything that is not English falls to Spanish, the default, rather than
  // to blank.
  assert.equal(dialCodeLabel(mexico, undefined), 'México');
  assert.equal(dialCodeLabel(undefined, 'es'), '');
});

test('Costa Rica is the country a visitor starts on', () => {
  assert.equal(DEFAULT_LIVE_CHAT_DIAL_CODE, '+506');
  assert.equal(LIVE_CHAT_DIAL_CODES[0].code, '+506', 'and the first one in the list');
  // Two countries sharing a code would make the picker ambiguous.
  const codes = LIVE_CHAT_DIAL_CODES.map((entry) => entry.code);
  assert.equal(new Set(codes).size, codes.length, 'duplicate dial code');
});

test('the pre-chat form opens for a visitor we only hold a fragment for', () => {
  // knownVisitor is now "we have everything a chat needs", not "we have
  // something". A visitor stored with only a name must still be asked for a way
  // to reach them, and the form is what asks.
  const onlyAName = { name: 'Ana', email: '', phone: '' };
  assert.equal(canStartLiveChat(onlyAName), false);
  assert.equal(
    shouldShowVisitorProfileForm({ knownVisitor: canStartLiveChat(onlyAName), messageCount: 0, showDetails: false }),
    true,
    'otherwise they are blocked from sending with no form to fix it in',
  );
});

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
