import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { countPromoEligibleUnits, checkUnitLimits } from '../src/lib/promoEligibility.mjs';

const catalog = fs.readFileSync('src/app/catalog/page.js', 'utf8');

// The flash sale as create-flash-sale.js writes it: targeted, 5 vials minimum.
const FLASH_SALE = {
  code: 'CELLULAR40',
  discount_pct: 0.4,
  is_active: true,
  is_flash_sale: true,
  target_product: 'MOTS-C,NAD+,SS-31',
  min_units: 5,
  max_units: null,
};

// ---------------------------------------------------------------------------
// Why the link was failing
// ---------------------------------------------------------------------------

test('an empty cart cannot satisfy the flash sale, so a mount-time apply loses', () => {
  // This is the state the old code applied the link's promo in: `cart` is still
  // the empty array from the first render, because the saved-cart restore is a
  // sibling mount effect whose setCart has not landed. Nothing about the
  // shopper caused this — the link simply asked too early.
  const check = checkUnitLimits(FLASH_SALE, countPromoEligibleUnits(FLASH_SALE, []));
  assert.equal(check.ok, false);
  assert.equal(check.unitCount, 0);
});

test('the same cart, filled, does satisfy it — so retrying is what was missing', () => {
  const cart = [
    { product: 'MOTS-C 10mg', qty: 3 },
    { product: 'NAD+ 500mg', qty: 2 },
  ];
  assert.equal(countPromoEligibleUnits(FLASH_SALE, cart), 5);
  assert.equal(checkUnitLimits(FLASH_SALE, countPromoEligibleUnits(FLASH_SALE, cart)).ok, true);
});

// ---------------------------------------------------------------------------
// The fix
// ---------------------------------------------------------------------------

test('the link’s code is retried as the cart changes, not once on mount', () => {
  // The whole bug was an empty dependency array. If this assertion ever fails
  // because the deps were trimmed back, the flash sale silently stops applying
  // from its own link again.
  assert.match(catalog, /handleApplyPromo\(code, \{ quiet: true \}\);\s*\}, \[cart, promoData, promoCodeInput\]\);/);
});

test('an empty cart is skipped rather than sent to the validator', () => {
  assert.match(catalog, /const units = getCartVialCount\(\);\s*\n\s*if \(units <= 0\) return;/);
});

test('an unchanged unit count is not revalidated', () => {
  // Otherwise every currency toggle and quantity swap costs an API call.
  assert.match(catalog, /if \(autoPromoTriedUnitsRef\.current === units\) return;/);
});

test('the code from the link is visible in the promo box straight away', () => {
  // A link that appears to do nothing is worse than one that shows the code and
  // what it asks for.
  assert.match(catalog, /autoPromoCodeRef\.current = linkCode;/);
  assert.match(catalog, /setPromoCodeInput\(linkCode\);/);
});

test('the automatic attempt fails quietly', () => {
  // A basket that does not qualify yet is a shopper who just walked in, not an
  // error to put in front of them.
  assert.match(catalog, /const handleApplyPromo = async \(codeOverride = null, \{ quiet = false \} = \{\}\) =>/);
  assert.match(catalog, /if \(!quiet\) setPromoError\(data\.error/);
  assert.match(catalog, /if \(!quiet\) setPromoError\(lang === 'en' \? 'Validation error'/);
  assert.match(catalog, /if \(!quiet\) \{\s*\n\s*setPromoError\(lang === 'en' \? `This promo requires/);
});

test('a code the customer typed still reports why it was refused', () => {
  // Only the automatic attempt is quiet. Pressing Apply and getting silence
  // would be the same bug wearing different clothes.
  assert.match(catalog, /handleApplyPromo\(\)/);
  assert.ok(!/handleApplyPromo\(\s*\)\s*,\s*\{ quiet: true \}/.test(catalog));
});

test('the customer’s own choice ends the link’s attempts', () => {
  assert.match(catalog, /if \(promoData\?\.valid\) \{\s*\n\s*autoPromoCodeRef\.current = null;/);
  assert.match(
    catalog,
    /if \(String\(promoCodeInput \|\| ''\)\.trim\(\)\.toUpperCase\(\) !== code\) \{\s*\n\s*autoPromoCodeRef\.current = null;/,
  );
});

test('seeding and applying live in one effect', () => {
  // Split across two, the seeding effect and this one run in the same commit;
  // this one then reads the input state the other has not updated yet and
  // concludes the customer cleared the box.
  assert.ok(!catalog.includes('autoPromoAppliedRef'), 'the old fire-once ref is still here');
  assert.match(catalog, /if \(!autoPromoInitRef\.current\) \{/);
});

test('every spelling of the promo parameter still works', () => {
  for (const param of ['promo_code', 'promo', 'coupon', 'discount']) {
    assert.ok(
      catalog.includes(`urlParams.get('${param}')`),
      `?${param}= is no longer read`,
    );
  }
});
