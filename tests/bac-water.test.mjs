import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAC_WATER_UNIT_PRICE_USD,
  BAC_WATER_ONLY_MIN_UNITS,
  BAC_WATER_10ML_UNIT_PRICE_USD,
  BAC_WATER_10ML_ONLY_MIN_UNITS,
  isBacWater,
  isSupplyItem,
  isReadyToUseBlend,
  splitCartUnits,
  bacUnitPrice,
  summarizeBacWater,
  checkBacOnlyMinimum,
  bacOnlyMinimumMessage,
  applyBacAwareDiscount,
  buildBacAwareOrderItems,
  getBacWaterSizeMl,
  isSellableBacWater,
  isGiftLine,
  bacGiftShortfall,
  bacFreeGrantForItem,
  summarizeFreeVials,
  defaultFreeBacConfig,
  withBacGiftLines,
} from '../src/lib/bacWater.mjs';

const peptide = (qty = 1) => ({ product: 'Semaglutide 5mg', qty });
const bac = (qty = 1, priceUsd) => ({ product: 'BAC Water 3ml', qty, priceUsd });
const bac10 = (qty = 1, priceUsd) => ({ product: 'BAC Water 10ml', qty, priceUsd });
const syringe = (qty = 1) => ({ product: 'Insulin Syringe 1ml', qty });
const fatBlaster = (qty = 1) => ({ product: 'Fat Blaster Amino Blend 10ml', qty });
const superHuman = (qty = 1) => ({ product: 'SUPER Human Amino Blend 10ml', qty });

test('recognises BAC water in both languages', () => {
  assert.equal(isBacWater('BAC Water 3ml'), true);
  assert.equal(isBacWater('Bacteriostatic Water'), true);
  assert.equal(isBacWater('Agua Bacteriostática 3ml'), true);
  assert.equal(isBacWater('Agua Bacteriostatica 3ml'), true); // unaccented
  assert.equal(isBacWater('Semaglutide 5mg'), false);
  assert.equal(isBacWater(null), false);
});

test('supplies are not peptides and not BAC water', () => {
  assert.equal(isSupplyItem('Insulin Syringe 1ml'), true);
  assert.equal(isSupplyItem('Jeringa 1ml'), true);
  assert.equal(isBacWater('Insulin Syringe 1ml'), false);
});

test('ready-to-use amino blends earn no free vial, but 5-Amino-1MQ still does', () => {
  assert.equal(isReadyToUseBlend('Fat Blaster Amino Blend 10ml'), true);
  assert.equal(isReadyToUseBlend('SUPER Human Amino Blend 10ml'), true);
  // 5-Amino-1MQ is a lyophilised peptide: it carries "amino" but not "blend",
  // so it keeps its free vial.
  assert.equal(isReadyToUseBlend('5-amino-1mq 5mg'), false);
  assert.equal(isReadyToUseBlend('Semaglutide 5mg'), false);
  assert.equal(isReadyToUseBlend(null), false);
});

test('amino blends count toward the discount but earn no free vial', () => {
  const cart = [fatBlaster(2), superHuman(1), bac(1)];
  const { bacUnits, peptideUnits, discountUnits } = splitCartUnits(cart);

  assert.equal(bacUnits, 1);
  assert.equal(peptideUnits, 0, 'blends are ready to use, no vial owed');
  assert.equal(discountUnits, 3, 'blends are normal products for the volume discount');
});

test('a blend bought with a real peptide only earns a vial for the peptide', () => {
  const s = summarizeBacWater([peptide(2), fatBlaster(1)], 'USD', 1);
  assert.equal(s.freeUnits, 2, 'two peptides earn two vials; the blend earns none');
});

// --- Per-product free-water config -----------------------------------------

const configured = (over = {}) => ({
  product: 'Semaglutide 5mg',
  qty: 1,
  freeBacWater: true,
  freeBacSizeMl: 3,
  freeBacVialsPerItem: 1,
  ...over,
});

test('the name-based default matches the old rule', () => {
  assert.deepEqual(defaultFreeBacConfig('Semaglutide 5mg'), { freeBacWater: true, freeBacSizeMl: 3, freeBacVialsPerItem: 1 });
  assert.equal(defaultFreeBacConfig('Fat Blaster Amino Blend 10ml').freeBacWater, false);
  assert.equal(defaultFreeBacConfig('Insulin Syringe 1ml').freeBacWater, false);
  assert.equal(defaultFreeBacConfig('BAC Water 3ml').freeBacWater, false);
});

test('explicit config wins over the name-based default', () => {
  // A product the admin turned off earns nothing, even though the name says peptide.
  assert.deepEqual(bacFreeGrantForItem(configured({ freeBacWater: false, qty: 3 })), { vials: 0, sizeMl: 3 });
  // Two 10ml vials per item, three items = six 10ml vials.
  assert.deepEqual(bacFreeGrantForItem(configured({ freeBacSizeMl: 10, freeBacVialsPerItem: 2, qty: 3 })), { vials: 6, sizeMl: 10 });
});

test('a configured cart earns free vials grouped by size', () => {
  const cart = [
    configured({ product: 'Semaglutide 5mg', qty: 2 }),
    configured({ product: 'BPC-157 10mg', qty: 1, freeBacSizeMl: 10 }),
    configured({ product: 'Fat Blaster Amino Blend 10ml', qty: 4, freeBacWater: false }),
  ];
  const { freeUnits, freeLines } = summarizeFreeVials(cart);
  assert.equal(freeUnits, 3, 'two 3ml plus one 10ml; the blend earns none');
  assert.deepEqual(freeLines, [{ sizeMl: 3, qty: 2 }, { sizeMl: 10, qty: 1 }]);
});

test('a config with no explicit setting falls back to the name rule', () => {
  const s = summarizeFreeVials([{ product: 'Semaglutide 5mg', qty: 2 }, { product: 'Insulin Syringe 1ml', qty: 1 }]);
  assert.equal(s.freeUnits, 2);
});

test('build produces a free line per size, priced at zero', () => {
  const items = buildBacAwareOrderItems([
    configured({ product: 'Semaglutide 5mg', qty: 1 }),
    configured({ product: 'BPC-157 10mg', qty: 1, freeBacSizeMl: 10 }),
  ], { currency: 'USD', priceOf: () => 90, lang: 'en' });

  const gifts = items.filter((i) => i.price === 0);
  assert.deepEqual(gifts, [
    { product: 'Bacteriostatic Water 3ml (Free Gift)', qty: 1, price: 0 },
    { product: 'Bacteriostatic Water 10ml (Free Gift)', qty: 1, price: 0 },
  ]);
  assert.equal(bacGiftShortfall(items).missing, 0, 'the built order lists everything it owes');
});

test('the top-up honours the configured size', () => {
  // A configured 10ml-gift peptide stored without its gift line is topped up in 10ml.
  const topped = withBacGiftLines([configured({ product: 'BPC-157 10mg', qty: 2, freeBacSizeMl: 10 })], 'en');
  const gift = topped.find((i) => i.price === 0);
  assert.equal(gift.product, 'Bacteriostatic Water 10ml (Free Gift)');
  assert.equal(gift.qty, 2);
});

test('splits units: BAC out of the discount, supplies out of the allowance', () => {
  const cart = [peptide(3), bac(5), syringe(2)];
  const { bacUnits, peptideUnits, discountUnits } = splitCartUnits(cart);

  assert.equal(bacUnits, 5);
  assert.equal(peptideUnits, 3, 'syringes must not earn free vials');
  assert.equal(discountUnits, 5, 'peptides + syringes, never BAC water');
});

test('one 10ml cart unit is one vial', () => {
  const { bacUnits } = splitCartUnits([bac10(1)]);
  assert.equal(bacUnits, 1);
});

test('the gift is one per peptide and the cart is all extras', () => {
  const s = summarizeBacWater([peptide(3), bac(5)], 'USD', 1);

  assert.equal(s.freeUnits, 3, 'one gift per peptide');
  assert.equal(s.paidUnits, 5, 'everything in the cart is an extra');
  assert.equal(s.charge, 5 * BAC_WATER_UNIT_PRICE_USD);
  assert.equal(s.shippedUnits, 8, 'three gifted plus five paid');
});

test('the gift ships when the customer adds no BAC water', () => {
  const s = summarizeBacWater([peptide(3)], 'USD', 1);

  assert.equal(s.freeUnits, 3, 'the gift survives a customer who never adds it');
  assert.equal(s.paidUnits, 0);
  assert.equal(s.charge, 0);
  assert.equal(s.shippedUnits, 3);
});

test('one peptide plus one added vial ships two and bills one', () => {
  // The case that decided this rule: the cart line must be billed, or a shopper
  // cannot tell whether what they added is going to cost them anything.
  const s = summarizeBacWater([peptide(1), bac(1)], 'USD', 1);

  assert.equal(s.freeUnits, 1);
  assert.equal(s.paidUnits, 1);
  assert.equal(s.charge, BAC_WATER_UNIT_PRICE_USD);
  assert.equal(s.shippedUnits, 2);
});

test('the gift is never reduced by what the cart holds', () => {
  const s = summarizeBacWater([peptide(4), bac(2)], 'USD', 1);

  assert.equal(s.freeUnits, 4, 'four peptides still earn four gifts');
  assert.equal(s.paidUnits, 2);
  assert.equal(s.charge, 2 * BAC_WATER_UNIT_PRICE_USD);
  assert.equal(s.shippedUnits, 6);
});

test('water-only cart earns no free vials', () => {
  const s = summarizeBacWater([bac(5)], 'USD', 1);

  assert.equal(s.freeUnits, 0);
  assert.equal(s.paidUnits, 5);
  assert.equal(s.charge, 50);
});

test('syringes do not earn free water', () => {
  const s = summarizeBacWater([syringe(4), bac(2)], 'USD', 1);

  assert.equal(s.freeUnits, 0);
  assert.equal(s.paidUnits, 2);
  assert.equal(s.charge, 20);
});

test('unit price converts to CRC and honours an admin-set price', () => {
  assert.equal(bacUnitPrice('USD', 500), 10);
  assert.equal(bacUnitPrice('CRC', 500), 5000);
  assert.equal(bacUnitPrice('USD', 500, 12), 12, 'admin price wins');
  assert.equal(bacUnitPrice('USD', 500, 0), 10, 'legacy zero price falls back');
  assert.equal(bacUnitPrice('USD', 500, 0, 'BAC Water 10ml'), 20);
  assert.equal(bacUnitPrice('CRC', 500, 0, 'BAC Water 10ml'), 10000);
  assert.equal(bacUnitPrice('USD', 500, 24, 'BAC Water 10ml'), 24, 'admin can update 10ml later');
  assert.equal(bacUnitPrice('USD', 500, '$24', 'BAC Water 10ml'), 24, 'formatted DB price works');
});

test('each BAC size keeps its own per-vial price', () => {
  const s = summarizeBacWater([bac(2), bac10(1)], 'USD', 1);

  assert.equal(s.charge, 2 * BAC_WATER_UNIT_PRICE_USD + BAC_WATER_10ML_UNIT_PRICE_USD);
  assert.equal(s.unitPrice, null, 'a mixed-size cart has no single BAC unit price');
  assert.deepEqual(s.paidLines, [
    { product: 'BAC Water 3ml', qty: 2, unitPrice: 10, charge: 20 },
    { product: 'BAC Water 10ml', qty: 1, unitPrice: 20, charge: 20 },
  ]);
});

test('the 10ml bills twenty dollars per vial', () => {
  const s = summarizeBacWater([bac10(3)], 'USD', 1);

  assert.equal(s.paidUnits, 3);
  assert.equal(s.shippedUnits, 3);
  assert.equal(s.charge, 60, 'three vials at twenty dollars each');
  assert.equal(s.unitPrice, BAC_WATER_10ML_UNIT_PRICE_USD);
});

test('CRC carts bill the converted price', () => {
  const s = summarizeBacWater([peptide(1), bac(3, 0)], 'CRC', 500);

  assert.equal(s.paidUnits, 3);
  assert.equal(s.charge, 3 * 5000);
});

test('water-only orders are held to a five vial floor', () => {
  assert.equal(checkBacOnlyMinimum([bac(5)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([bac(6)]).blocked, false);

  const short = checkBacOnlyMinimum([bac(2)]);
  assert.equal(short.blocked, true);
  assert.equal(short.shortfall, 3);
  assert.equal(short.minUnits, BAC_WATER_ONLY_MIN_UNITS);
});

test('a 10ml-only cart needs three vials', () => {
  const short = checkBacOnlyMinimum([bac10(1)]);
  assert.equal(short.blocked, true, 'one vial alone is below the floor');
  assert.equal(short.shortfall, 2);
  assert.equal(short.minUnits, BAC_WATER_10ML_ONLY_MIN_UNITS);
  assert.equal(short.tenMlOnly, true);

  assert.equal(checkBacOnlyMinimum([bac10(2)]).blocked, true);
  assert.equal(checkBacOnlyMinimum([bac10(3)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([bac10(4)]).blocked, false);
});

test('mixed water sizes retain the existing five-vial water-only floor', () => {
  assert.equal(checkBacOnlyMinimum([bac(1), bac10(1)]).blocked, true);
  assert.equal(checkBacOnlyMinimum([bac(4), bac10(1)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([bac(1), bac10(3)]).blocked, true, 'four vials is short of five');
});

test('any peptide exempts the cart from the floor', () => {
  assert.equal(checkBacOnlyMinimum([peptide(1), bac(1)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([syringe(1), bac(1)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([peptide(1), bac10(1)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([syringe(1), bac10(1)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([]).blocked, false);
  assert.equal(checkBacOnlyMinimum([peptide(1)]).blocked, false);
});

test('the floor message names the shortfall, and clears once met', () => {
  assert.match(bacOnlyMinimumMessage([bac(2)], 'en'), /add 3 more/);
  assert.match(bacOnlyMinimumMessage([bac(2)], 'es'), /agregá 3 más/);
  assert.equal(bacOnlyMinimumMessage([bac(5)], 'en'), null);
  assert.match(bacOnlyMinimumMessage([bac10(1)], 'en'), /3 vials.*add 2 more/);
  assert.equal(bacOnlyMinimumMessage([bac10(3)], 'en'), null);
});

test('the volume discount skips the BAC charge', () => {
  // 3 peptides at $90 + 2 paid vials at $10, with a 20% tier.
  const r = applyBacAwareDiscount(270, 20, 20);

  assert.equal(r.discountAmount, 54, '20% of 270, not of 290');
  assert.equal(r.itemsTotal, 216 + 20);
  assert.equal(r.subtotal, 290);
});

test('no discount leaves both parts untouched', () => {
  const r = applyBacAwareDiscount(270, 20, 0);

  assert.equal(r.discountAmount, 0);
  assert.equal(r.itemsTotal, 290);
});

// --- Order lines ------------------------------------------------------------

const priceOf = (item) => (item.product === 'Semaglutide 5mg' ? 90 : 15);
const build = (cart, lang = 'en') =>
  buildBacAwareOrderItems(cart, { currency: 'USD', exchangeRate: 1, priceOf, lang });

test('a BAC cart line is billed in full, with the gift listed beside it', () => {
  const items = build([peptide(3), bac(5)]);

  assert.deepEqual(items, [
    { product: 'Semaglutide 5mg', qty: 3, price: 90 },
    { product: 'BAC Water 3ml', qty: 5, price: 10 },
    { product: 'BAC Water 3ml (Free Gift)', qty: 3, price: 0 },
  ]);
});

test('the gift line appears even when no BAC water was added', () => {
  const items = build([peptide(2)]);

  assert.deepEqual(items, [
    { product: 'Semaglutide 5mg', qty: 2, price: 90 },
    { product: 'Bacteriostatic Water 3ml (Free Gift)', qty: 2, price: 0 },
  ]);
});

test('a water-only order has no gift line at all', () => {
  const items = build([bac(5)]);

  assert.deepEqual(items, [{ product: 'BAC Water 3ml', qty: 5, price: 10 }]);
});

test('mixed paid sizes remain separate order lines at their own prices', () => {
  const items = build([peptide(1), bac(2), bac10(3)]);

  assert.deepEqual(items, [
    { product: 'Semaglutide 5mg', qty: 1, price: 90 },
    { product: 'BAC Water 3ml', qty: 2, price: 10 },
    { product: 'BAC Water 10ml', qty: 3, price: 20 },
    { product: 'BAC Water 3ml (Free Gift)', qty: 1, price: 0 },
  ]);
});

test('gift line is localised', () => {
  const items = build([peptide(1)], 'es');
  assert.equal(items[1].product, 'Agua Bacteriostática 3ml (Regalo)');
});

// The bug this whole module exists to prevent: the cart charging one number
// while the emailed/stored line items add up to another. Swept across every
// cart shape rather than spot-checked, because each checkout path builds its
// lines and its total separately.
test('order lines always sum to the subtotal the customer is charged', () => {
  for (let peptides = 0; peptides <= 6; peptides++) {
    for (let vials = 0; vials <= 8; vials++) {
      for (let bigVials = 0; bigVials <= 4; bigVials++) {
        for (let syringes = 0; syringes <= 2; syringes++) {
          const cart = [
            ...(peptides ? [peptide(peptides)] : []),
            ...(syringes ? [syringe(syringes)] : []),
            ...(vials ? [bac(vials)] : []),
            ...(bigVials ? [bac10(bigVials)] : []),
          ];
          if (cart.length === 0) continue;

          const lineSum = build(cart).reduce((s, li) => s + li.price * li.qty, 0);

          const discountable = cart
            .filter((i) => !isBacWater(i.product))
            .reduce((s, i) => s + priceOf(i) * i.qty, 0);
          const { subtotal } = applyBacAwareDiscount(
            discountable,
            summarizeBacWater(cart, 'USD', 1).charge,
            0,
          );

          assert.equal(
            lineSum,
            subtotal,
            `lines ${lineSum} != subtotal ${subtotal} for ${peptides}p/${vials}b/${bigVials}B/${syringes}s`,
          );
        }
      }
    }
  }
});

// --- Sellable BAC sizes -----------------------------------------------------

test('reads the size out of a BAC listing name', () => {
  assert.equal(getBacWaterSizeMl('BAC Water 3ml'), 3);
  assert.equal(getBacWaterSizeMl('BAC Water 10ml'), 10);
  assert.equal(getBacWaterSizeMl('Agua Bacteriostática 2 ml'), 2);
  assert.equal(getBacWaterSizeMl('Bacteriostatic Water'), null, 'no size given');
  assert.equal(getBacWaterSizeMl('Semaglutide 5mg'), null, 'not BAC water at all');
});

test('the 3ml and 10ml listings are sellable', () => {
  assert.equal(isSellableBacWater('BAC Water 3ml'), true);
  assert.equal(isSellableBacWater('BAC Water 2ml'), false);
  assert.equal(isSellableBacWater('BAC Water 10ml'), true);
  assert.equal(isSellableBacWater('BACWater10ml'), false, 'no space means it is not recognised as BAC water');
});

test('an unsized BAC listing is treated as the 3ml', () => {
  // 3ml is the only size sold, so an unsized row can only mean that one.
  assert.equal(isSellableBacWater('Bacteriostatic Water'), true);
  assert.equal(isSellableBacWater('Agua Bacteriostática'), true);
});

test('a non-BAC product is never "sellable BAC water"', () => {
  assert.equal(isSellableBacWater('Semaglutide 5mg'), false);
  assert.equal(isSellableBacWater(null), false);
});

test('recognises a granted vial by its tag or its zero price', () => {
  assert.equal(isGiftLine({ product: 'Bacteriostatic Water 3ml (Free Gift)', qty: 1, price: 0 }), true);
  assert.equal(isGiftLine({ product: 'Agua Bacteriostática 3ml (Regalo)', qty: 2, price: 0 }), true);
  // Untagged but unpaid: an order placed before the suffix existed.
  assert.equal(isGiftLine({ product: 'BAC Water 3ml', qty: 1, price: 0 }), true);
  assert.equal(isGiftLine({ product: 'BAC Water 3ml', qty: 1, price: 10 }), false);
  // A zero-priced peptide is a promotional line, not a gifted vial.
  assert.equal(isGiftLine({ product: 'Semaglutide 5mg', qty: 1, price: 0 }), false);
});

test('an order with no water at all is short its whole allowance', () => {
  const shortfall = bacGiftShortfall([{ product: 'CJC-1295 without DAC + IPA 10mg', qty: 2, price: 53872 }]);
  assert.deepEqual(shortfall, { granted: 2, present: 0, missing: 2 });
});

test('an order carrying its gift line is short nothing', () => {
  const shortfall = bacGiftShortfall([
    { product: 'Semaglutide 5mg', qty: 3, price: 100 },
    { product: 'Agua Bacteriostática 3ml (Regalo)', qty: 3, price: 0 },
  ]);
  assert.deepEqual(shortfall, { granted: 3, present: 3, missing: 0 });
});

test('paid vials do not stand in for the gift', () => {
  // The regression: two bought vials made the old all-or-nothing check treat
  // the order as already handled, and the three free ones were never granted.
  const shortfall = bacGiftShortfall([
    { product: 'Semaglutide 5mg', qty: 3, price: 100 },
    { product: 'BAC Water 10ml', qty: 2, price: 20 },
  ]);
  assert.deepEqual(shortfall, { granted: 3, present: 0, missing: 3 });
});

test('a partly granted order is topped up, not re-granted', () => {
  const shortfall = bacGiftShortfall([
    { product: 'Semaglutide 5mg', qty: 4, price: 100 },
    { product: 'Bacteriostatic Water 3ml (Free Gift)', qty: 1, price: 0 },
  ]);
  assert.equal(shortfall.missing, 3);
});

test('supplies and water-only orders earn no free vial', () => {
  assert.equal(bacGiftShortfall([syringe(3)]).missing, 0);
  assert.equal(bacGiftShortfall([{ product: 'BAC Water 3ml', qty: 5, price: 10 }]).missing, 0);
  assert.equal(bacGiftShortfall([]).missing, 0);
});

test('a gift already granted beyond the allowance is never negative', () => {
  const shortfall = bacGiftShortfall([
    { product: 'Semaglutide 5mg', qty: 1, price: 100 },
    { product: 'Bacteriostatic Water 3ml (Free Gift)', qty: 4, price: 0 },
  ]);
  assert.equal(shortfall.missing, 0);
});

test('what buildBacAwareOrderItems writes leaves nothing missing', () => {
  const items = buildBacAwareOrderItems([peptide(2), bac(1, 10)], {
    currency: 'USD',
    priceOf: () => 100,
    lang: 'en',
  });
  assert.equal(bacGiftShortfall(items).missing, 0);
});
