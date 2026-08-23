// Recovery emails must quote the price the catalog is actually charging.
//
// Until 24 Aug 2026 the route called its row builder without a rate, so the
// parameter fell through to a hardcoded 454.48 while the catalog priced from
// the live feed. On a $125 vial the email was ~638 colones off.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { abandonedCartUnitPrice, parseCartPrice } from '../src/lib/abandonedCartPricing.mjs';

const LIVE = 449.375;   // what CurrencyFreaks quoted on the day this was fixed
const STALE = 454.48;   // the constant the email used to be stuck on

test('a USD cart line is left alone', () => {
  assert.equal(abandonedCartUnitPrice({ priceUsd: '$125' }, 'USD', LIVE), 125);
});

test('a colon line converts at the rate it is given, not a hardcoded one', () => {
  assert.equal(abandonedCartUnitPrice({ priceUsd: '$125' }, 'CRC', LIVE), 56172);
  assert.notEqual(
    abandonedCartUnitPrice({ priceUsd: '$125' }, 'CRC', LIVE),
    Math.round(125 * STALE),
    'the email must not quote the old 454.48 price of 56,810',
  );
});

test('the email and the catalog agree on the same rate', () => {
  // Catalog does Math.round(usd * rate); see getPriceAsNumber in catalog/page.js.
  for (const usd of [100, 125, 135, 180, 240]) {
    assert.equal(
      abandonedCartUnitPrice({ priceUsd: `$${usd}` }, 'CRC', LIVE),
      Math.round(usd * LIVE),
      `email and catalog disagree on $${usd}`,
    );
  }
});

test('a USD price outranks a stored colon price written at an older rate', () => {
  const item = { priceUsd: '$125', priceCrc: '₡60,563' };   // the 484.50-era value
  assert.equal(abandonedCartUnitPrice(item, 'CRC', LIVE), 56172);
});

test('a stored colon price is used only when there is no USD figure', () => {
  assert.equal(abandonedCartUnitPrice({ priceCrc: '₡44,938' }, 'CRC', LIVE), 44938);
});

test('a bare price field still converts rather than being shown as colones', () => {
  assert.equal(abandonedCartUnitPrice({ price: '125' }, 'CRC', LIVE), 56172);
});

test('missing and malformed prices come back as zero, not NaN', () => {
  assert.equal(abandonedCartUnitPrice({}, 'CRC', LIVE), 0);
  assert.equal(abandonedCartUnitPrice({ priceUsd: 'n/a' }, 'CRC', LIVE), 0);
  assert.equal(parseCartPrice(null), 0);
  assert.equal(parseCartPrice('₡1,234'), 1234);
});

test('the route passes a real rate through instead of defaulting', () => {
  // Guards the original bug: a 3-argument builder called with 2.
  const src = fs.readFileSync('src/app/api/abandoned-cart-notification/route.js', 'utf8');

  assert.match(
    src,
    /buildItemsRows\(cartData,\s*currency,\s*exchangeRate\)/,
    'buildItemsRows must be given the rate, not left to its default',
  );
  assert.match(
    src,
    /getDatabaseBackedUsdToCrcRate\(\)/,
    'the route must resolve a live rate before building the email',
  );
  assert.ok(
    !/=\s*454\.48/.test(src),
    'no bare 454.48 literal — use FALLBACK_EXCHANGE_RATE so there is one constant',
  );
});
