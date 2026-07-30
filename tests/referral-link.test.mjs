import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReferralLink,
  catalogBaseUrl,
  referralQrFilename,
  slugify,
} from '../src/lib/referralLink.mjs';

const BASE = 'https://catalog.peptidescostarica.net/catalog?lang=es';

test('a rep link carries the name checkout will write to the order', () => {
  // sales_agent is the whole mechanism: the catalog reads it into localStorage
  // and writes it to orders.sales_agent, which is what the commission scan
  // matches. Get this wrong and a printed card credits nobody.
  const url = new URL(buildReferralLink('María Jiménez', BASE));
  assert.equal(url.searchParams.get('sales_agent'), 'María Jiménez');
  assert.equal(url.searchParams.get('referral'), 'María Jiménez');
  assert.equal(url.searchParams.get('utm_source'), 'sales_rep');
  assert.equal(url.searchParams.get('utm_medium'), 'qr');
  assert.equal(url.searchParams.get('utm_campaign'), 'maria-jimenez');
  assert.equal(url.searchParams.get('gate'), 'skip');
  assert.equal(url.searchParams.get('lang'), 'es');
});

test('accents and spaces survive the round trip', () => {
  // A card printed for "Sofía Mena" has to scan back to exactly that string,
  // or agentMatchKeys will not match her profile.
  const link = buildReferralLink('Sofía Mena', BASE);
  assert.equal(new URL(link).searchParams.get('sales_agent'), 'Sofía Mena');
  assert.ok(link.includes('utm_campaign=sofia-mena'));
});

test('two reps never share a link', () => {
  const a = buildReferralLink('Ana Solano', BASE);
  const b = buildReferralLink('Ana Soto', BASE);
  assert.notEqual(a, b);
});

test('the filename is safe for a print shop to handle', () => {
  assert.equal(referralQrFilename('María Jiménez'), 'maria-jimenez-qr.png');
  assert.equal(referralQrFilename('Ana  Solano '), 'ana-solano-qr.png');
  // Never an empty or dotfile name, whatever the input.
  assert.equal(referralQrFilename(''), 'rep-qr.png');
  assert.equal(referralQrFilename('***'), 'rep-qr.png');
});

test('slugify does not collapse distinct names into one campaign', () => {
  assert.notEqual(slugify('Ana Solano'), slugify('Ana Soto'));
  assert.equal(slugify('  Diego  Ruiz  '), 'diego-ruiz');
});

test('the catalog origin is configurable but never empty', () => {
  assert.equal(
    catalogBaseUrl({ NEXT_PUBLIC_AFFILIATE_CATALOG_URL: 'https://example.com/shop' }),
    'https://example.com/shop'
  );
  assert.ok(catalogBaseUrl({}).startsWith('https://'));
  assert.ok(catalogBaseUrl().startsWith('https://'));
});

test('a custom catalog origin still gets a language', () => {
  const url = new URL(buildReferralLink('Luis', 'https://example.com/shop'));
  assert.equal(url.searchParams.get('lang'), 'es');
  assert.equal(url.searchParams.get('sales_agent'), 'Luis');
});
