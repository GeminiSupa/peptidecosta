import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import {
  META_SIGNATURE_HEADER,
  metaAppSecret,
  metaSignatureMatches,
} from '../src/lib/metaWebhookSignature.mjs';

const SECRET = 'a-meta-app-secret';
const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '123' }] });

const sign = (body, secret = SECRET) => `sha256=${crypto
  .createHmac('sha256', secret)
  .update(body, 'utf8')
  .digest('hex')}`;

test('a genuine Meta signature is accepted', () => {
  assert.equal(metaSignatureMatches(BODY, sign(BODY), SECRET), true);
});

test('the header Meta signs with is the one the routes read', () => {
  assert.equal(META_SIGNATURE_HEADER, 'x-hub-signature-256');
});

test('an uppercase hex digest still matches', () => {
  assert.equal(metaSignatureMatches(BODY, sign(BODY).toUpperCase(), SECRET), true);
});

test('a body altered by even one character is rejected', () => {
  const signature = sign(BODY);
  const tampered = BODY.replace('"123"', '"124"');
  assert.notEqual(tampered, BODY);
  assert.equal(metaSignatureMatches(tampered, signature, SECRET), false);
});

test('a signature made with a different secret is rejected', () => {
  assert.equal(metaSignatureMatches(BODY, sign(BODY, 'someone-elses-secret'), SECRET), false);
});

test('a forged request with no signature at all is rejected', () => {
  for (const header of [undefined, null, '', '   ']) {
    assert.equal(metaSignatureMatches(BODY, header, SECRET), false);
  }
});

test('a bare digest without the sha256= prefix is rejected', () => {
  const bare = sign(BODY).slice('sha256='.length);
  assert.equal(metaSignatureMatches(BODY, bare, SECRET), false);
});

test('a wrong-length or non-hex digest is rejected rather than throwing', () => {
  const digest = sign(BODY).slice('sha256='.length);
  assert.equal(metaSignatureMatches(BODY, `sha256=${digest.slice(0, 32)}`, SECRET), false);
  assert.equal(metaSignatureMatches(BODY, `sha256=${digest}ff`, SECRET), false);
  assert.equal(metaSignatureMatches(BODY, `sha256=${'z'.repeat(64)}`, SECRET), false);
});

test('a sha1 signature from the old header is not accepted', () => {
  const sha1 = crypto.createHmac('sha1', SECRET).update(BODY, 'utf8').digest('hex');
  assert.equal(metaSignatureMatches(BODY, `sha1=${sha1}`, SECRET), false);
});

test('no configured secret means nothing verifies, even a correct digest', () => {
  // Guards the fail-closed contract: an unset secret must never make the
  // endpoint accept traffic.
  assert.equal(metaSignatureMatches(BODY, sign(BODY, ''), ''), false);
  assert.equal(metaSignatureMatches(BODY, sign(BODY), ''), false);
  assert.equal(metaSignatureMatches(BODY, sign(BODY), '   '), false);
});

test('an empty body is still verified rather than waved through', () => {
  assert.equal(metaSignatureMatches('', sign(''), SECRET), true);
  assert.equal(metaSignatureMatches('', sign('{}'), SECRET), false);
});

test('unicode in a message body signs and verifies byte-for-byte', () => {
  const body = JSON.stringify({ text: 'Hola, ¿cuánto cuesta? 😀 растворитель' });
  assert.equal(metaSignatureMatches(body, sign(body), SECRET), true);
});

test('each channel reads its own secret before the shared one', () => {
  const env = {
    META_APP_SECRET: 'shared',
    WHATSAPP_APP_SECRET: 'wa-only',
  };
  assert.equal(metaAppSecret('whatsapp', env), 'wa-only');
  assert.equal(metaAppSecret('facebook', env), 'shared');
  assert.equal(metaAppSecret('messenger', env), 'shared');
});

test('the shared secret covers all three channels when no override is set', () => {
  const env = { META_APP_SECRET: 'shared' };
  for (const channel of ['whatsapp', 'facebook', 'messenger']) {
    assert.equal(metaAppSecret(channel, env), 'shared');
  }
});

test('the existing FACEBOOK_APP_SECRET verifies all three channels', () => {
  // One Meta app signs every product's webhook with one secret, so the secret
  // already in the environment is enough — no new setting is needed to switch
  // verification on.
  const env = { FACEBOOK_APP_SECRET: 'the-one-app-secret' };
  for (const channel of ['whatsapp', 'facebook', 'messenger']) {
    assert.equal(metaAppSecret(channel, env), 'the-one-app-secret');
  }
});

test('META_APP_SECRET outranks FACEBOOK_APP_SECRET, and a channel override outranks both', () => {
  const env = {
    FACEBOOK_APP_SECRET: 'fb-app',
    META_APP_SECRET: 'shared',
    WHATSAPP_APP_SECRET: 'wa-only',
  };
  assert.equal(metaAppSecret('whatsapp', env), 'wa-only');
  assert.equal(metaAppSecret('messenger', env), 'shared');
  // FACEBOOK_APP_SECRET is the Facebook channel's OWN variable, so for that one
  // channel it is the most specific setting and outranks the shared secret. It
  // is only a last-resort fallback for the other two.
  assert.equal(metaAppSecret('facebook', env), 'fb-app');
  assert.equal(metaAppSecret('messenger', { FACEBOOK_APP_SECRET: 'fb-app' }), 'fb-app');
});

test('a blank or whitespace-only secret counts as unset', () => {
  assert.equal(metaAppSecret('whatsapp', {}), '');
  assert.equal(metaAppSecret('whatsapp', { META_APP_SECRET: '   ' }), '');
  assert.equal(metaAppSecret('whatsapp', { WHATSAPP_APP_SECRET: '  ', META_APP_SECRET: 'shared' }), 'shared');
});
