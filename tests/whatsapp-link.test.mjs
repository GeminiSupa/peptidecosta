import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_GREETING,
  buildWhatsAppLink,
  readClickAttribution,
} from '../src/lib/whatsappLink.mjs';

const textOf = (url) => decodeURIComponent(url.split('text=')[1] ?? '');

const store = (values) => ({ getItem: (k) => (k in values ? values[k] : null) });

test('the greeting follows the language the page is in', () => {
  assert.equal(textOf(buildWhatsAppLink('50684046973', null, 'es')), 'Hola, me interesa');
  assert.equal(textOf(buildWhatsAppLink('50684046973', null, 'en')), "Hello I'm interested");
});

test('Spanish is the fallback, matching the storefront default', () => {
  assert.equal(textOf(buildWhatsAppLink('506', null)), DEFAULT_GREETING.es);
  assert.equal(textOf(buildWhatsAppLink('506', null, 'fr')), DEFAULT_GREETING.es);
  assert.equal(textOf(buildWhatsAppLink('506', null, '')), DEFAULT_GREETING.es);
});

test('a caller with its own message keeps it', () => {
  const msg = '¡Hola! Tengo algunas preguntas.';
  assert.equal(textOf(buildWhatsAppLink('506', msg, 'en')), msg);
});

test('the customer never sends our internal tracking note', () => {
  // The regression this exists for: "[Source: email (Camp: tesa15_flash_sale)]"
  // was appearing in the customer's own outgoing message.
  for (const lang of ['es', 'en']) {
    const text = textOf(buildWhatsAppLink('506', null, lang));
    assert.doesNotMatch(text, /\[Source:/i, 'no Source tag');
    assert.doesNotMatch(text, /Camp:/i, 'no campaign slug');
    assert.doesNotMatch(text, /utm/i, 'no utm values');
    assert.equal(text.includes('\n'), false, 'the greeting is a single line');
  }
});

test('the link is a valid wa.me url with the text encoded', () => {
  const url = buildWhatsAppLink('50684046973', null, 'es');
  assert.ok(url.startsWith('https://wa.me/50684046973?text='));
  assert.ok(!url.includes(' '), 'spaces must be encoded');
  assert.equal(new URL(url).searchParams.get('text'), 'Hola, me interesa');
});

test('attribution is read for storing, not for showing', () => {
  const got = readClickAttribution(store({
    lead_utm_source: 'email',
    lead_utm_medium: 'newsletter',
    lead_utm_campaign: 'tesa15_flash_sale',
    lead_referrer: 'https://www.google.com/search?q=peptides',
  }), 'es');

  assert.deepEqual(got, {
    utm_source: 'email',
    utm_medium: 'newsletter',
    utm_campaign: 'tesa15_flash_sale',
    referrer: 'google.com',
    lang: 'es',
  });
});

test('a referrer is reduced to its hostname, never the full url', () => {
  // The full URL can carry a search query the visitor typed; the host is enough.
  const got = readClickAttribution(store({ lead_referrer: 'https://www.facebook.com/somepage?fbclid=xyz' }));
  assert.equal(got.referrer, 'facebook.com');
  assert.doesNotMatch(got.referrer, /fbclid/);
});

test('missing or broken values do not throw', () => {
  assert.deepEqual(readClickAttribution(store({})), {
    utm_source: '', utm_medium: '', utm_campaign: '', referrer: '', lang: '',
  });
  assert.equal(readClickAttribution(store({ lead_referrer: 'not a url' })).referrer, '');
  assert.equal(readClickAttribution(null).utm_source, '');
  assert.equal(readClickAttribution(undefined).referrer, '');
});

test('a storage that throws is survivable', () => {
  // Safari in private mode throws rather than returning null.
  const hostile = { getItem: () => { throw new Error('denied'); } };
  assert.deepEqual(readClickAttribution(hostile, 'en'), {
    utm_source: '', utm_medium: '', utm_campaign: '', referrer: '', lang: 'en',
  });
});

test('the click logger stores the attribution and checks the insert', async () => {
  const source = await readFile(new URL('../src/lib/whatsapp.ts', import.meta.url), 'utf8');
  assert.match(source, /readClickAttribution/, 'the logger records attribution');
  assert.match(source, /if \(error\)/, 'a failed insert must not look like a success');
  // The tag builder is gone from here entirely.
  assert.doesNotMatch(source, /\[Source:/);
  assert.doesNotMatch(source, /trackingText/);
});
