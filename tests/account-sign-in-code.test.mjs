import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAccountWelcomeEmail,
  buildSignInCodeEmail,
  isMissingAuthUser,
  signInCodeFromLink,
  verifyTypeFromLink,
} from '../src/lib/accountSignInCode.mjs';

test('the sign-in email is the code and has no link', () => {
  const email = buildSignInCodeEmail('48291307');
  assert.match(email.subject, /código/i);
  assert.match(email.text, /48291307/);
  assert.match(email.html, /48291307/);
  assert.match(email.html, /cid:peptides-costa-rica-logo/);
  assert.equal(email.html.includes('href'), false);
  assert.equal(email.text.includes('http'), false);
});

test('an english sign-in email stays in english', () => {
  const email = buildSignInCodeEmail('48291307', 'en');
  assert.match(email.subject, /sign-in code/i);
  assert.equal(/código/i.test(email.html), false);
  assert.match(email.html, /48291307/);
  assert.match(email.html, /cid:peptides-costa-rica-logo/);
  assert.equal(email.html.includes('href'), false);
});

test('a sign-in code is accepted as the digits from the login link', () => {
  assert.equal(signInCodeFromLink({ properties: { email_otp: '123456' } }), '123456');
  assert.equal(signInCodeFromLink({ properties: { email_otp: '12345678' } }), '12345678');
  assert.equal(signInCodeFromLink({ properties: { email_otp: '12345' } }), null);
  assert.equal(signInCodeFromLink({ properties: { email_otp: 'abcdefgh' } }), null);
  assert.equal(signInCodeFromLink({}), null);
});

test('the code is checked as a magic link, or as a first-time signup', () => {
  assert.equal(verifyTypeFromLink({ properties: { verification_type: 'magiclink' } }), 'magiclink');
  assert.equal(verifyTypeFromLink({ properties: { verification_type: 'signup' } }), 'signup');
  assert.equal(verifyTypeFromLink({ properties: { verification_type: 'recovery' } }), null);
});

test('a missing login is the only reason to create one', () => {
  assert.equal(isMissingAuthUser({ message: 'User with this email not found' }), true);
  assert.equal(isMissingAuthUser({ code: 'user_not_found' }), true);
  assert.equal(isMissingAuthUser({ message: 'rate limit' }), false);
});

test('the welcome email follows the language and shows the logo', () => {
  const english = buildAccountWelcomeEmail({ name: 'Ana', lang: 'en' });
  assert.match(english.subject, /account is ready/i);
  assert.match(english.html, /Open my account/);
  assert.match(english.html, /cid:peptides-costa-rica-logo/);
  assert.match(english.html, /catalog\.peptidescostarica\.net\/account\?lang=en/);

  const spanish = buildAccountWelcomeEmail({ name: 'Ana', lang: 'es' });
  assert.match(spanish.subject, /cuenta/i);
  assert.match(spanish.html, /Abrir mi cuenta/);
  assert.equal(/Open my account/.test(spanish.html), false);
});

test('anything outside 6 to 10 digits is refused before an email is built', () => {
  assert.throws(() => buildSignInCodeEmail('12'), /6 to 10 digits/);
  assert.throws(() => buildSignInCodeEmail(''), /6 to 10 digits/);
});
