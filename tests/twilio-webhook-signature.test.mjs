import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  checkTwilioSignature,
  publicWebhookUrl,
  SIGNATURE_HEADER,
} from '../src/lib/twilioWebhookSignature.mjs';

// Twilio's documented scheme: the URL, then each param sorted by name and
// appended as name+value, HMAC-SHA1 with the auth token, base64.
function signLikeTwilio(authToken, url, params) {
  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}
const validate = (token, signature, url, params) => signLikeTwilio(token, url, params) === signature;

const TOKEN = 'test-auth-token';
const URL_ = 'https://catalog.peptidescostarica.net/api/admin/twilio/voice';
const PARAMS = { To: '+50688887777', From: 'client:admin-1' };

const request = (headers) => ({
  url: 'http://10.0.0.1:3000/api/admin/twilio/voice',
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
});

test('a genuine Twilio request is accepted', () => {
  const result = checkTwilioSignature({
    signature: signLikeTwilio(TOKEN, URL_, PARAMS),
    authToken: TOKEN, url: URL_, params: PARAMS, validate, isProduction: true,
  });
  assert.equal(result.ok, true);
});

test('a forged signature is refused in production', () => {
  const result = checkTwilioSignature({
    signature: 'not-the-real-signature',
    authToken: TOKEN, url: URL_, params: PARAMS, validate, isProduction: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad signature');
});

test('a stranger posting with no signature is refused in production', () => {
  const result = checkTwilioSignature({
    signature: null, authToken: TOKEN, url: URL_, params: PARAMS, validate, isProduction: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing signature');
});

test('an unsigned request still works on a dev machine', () => {
  const result = checkTwilioSignature({
    signature: null, authToken: TOKEN, url: URL_, params: PARAMS, validate, isProduction: false,
  });
  assert.equal(result.ok, true);
});

test('a signed request is still verified outside production', () => {
  const result = checkTwilioSignature({
    signature: 'wrong', authToken: TOKEN, url: URL_, params: PARAMS, validate, isProduction: false,
  });
  assert.equal(result.ok, false);
});

test('changing any posted field breaks the signature', () => {
  const signature = signLikeTwilio(TOKEN, URL_, PARAMS);
  const tampered = { ...PARAMS, To: '+19005551234' };
  const result = checkTwilioSignature({
    signature, authToken: TOKEN, url: URL_, params: tampered, validate, isProduction: true,
  });
  assert.equal(result.ok, false);
});

test('without an auth token nothing is trusted, even off production', () => {
  const result = checkTwilioSignature({
    signature: 'anything', authToken: '', url: URL_, params: PARAMS, validate, isProduction: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no auth token to verify against');
});

test('a validator that throws is treated as a failure, not a pass', () => {
  const result = checkTwilioSignature({
    signature: 'x', authToken: TOKEN, url: URL_, params: PARAMS, isProduction: true,
    validate: () => { throw new Error('boom'); },
  });
  assert.equal(result.ok, false);
});

test('the signed URL is rebuilt from the public host, not the proxy hop', () => {
  const url = publicWebhookUrl(request({
    'x-forwarded-host': 'catalog.peptidescostarica.net',
    'x-forwarded-proto': 'http',
  }));
  assert.equal(url, URL_);
});

test('localhost keeps http so a dev server can be hit directly', () => {
  const url = publicWebhookUrl({
    url: 'http://localhost:3000/api/admin/twilio/voice',
    headers: { get: (n) => (n.toLowerCase() === 'host' ? 'localhost:3000' : null) },
  });
  assert.equal(url, 'http://localhost:3000/api/admin/twilio/voice');
});

test('the header name matches what Twilio sends', () => {
  assert.equal(SIGNATURE_HEADER, 'x-twilio-signature');
});
