import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSignInCodeEmail,
  isMissingAuthUser,
  signInCodeFromLink,
  verifyTypeFromLink,
} from '../src/lib/accountSignInCode.mjs';

test('the sign-in email is the six digits and has no link', () => {
  const email = buildSignInCodeEmail('482913');
  assert.match(email.subject, /código/i);
  assert.match(email.text, /482913/);
  assert.match(email.html, /482913/);
  assert.equal(email.html.includes('http'), false);
  assert.equal(email.html.includes('href'), false);
  assert.equal(email.text.includes('http'), false);
});

test('a sign-in code is accepted only as six digits from the login link', () => {
  assert.equal(signInCodeFromLink({ properties: { email_otp: '123456' } }), '123456');
  assert.equal(signInCodeFromLink({ properties: { email_otp: '12345' } }), null);
  assert.equal(signInCodeFromLink({ properties: { email_otp: 'abcdef' } }), null);
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

test('anything other than six digits is refused before an email is built', () => {
  assert.throws(() => buildSignInCodeEmail('12'), /6 digits/);
  assert.throws(() => buildSignInCodeEmail(''), /6 digits/);
});
