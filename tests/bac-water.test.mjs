import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAC_WATER_UNIT_PRICE_USD,
  BAC_WATER_ONLY_MIN_UNITS,
  isBacWater,
  isSupplyItem,
  splitCartUnits,
  bacUnitPrice,
  summarizeBacWater,
  checkBacOnlyMinimum,
  bacOnlyMinimumMessage,
  applyBacAwareDiscount,
  buildBacAwareOrderItems,
  getBacWaterSizeMl,
  isSellableBacWater,
} from '../src/lib/bacWater.mjs';

const peptide = (qty = 1) => ({ product: 'Semaglutide 5mg', qty });
const bac = (qty = 1, priceUsd) => ({ product: 'BAC Water 3ml', qty, priceUsd });
const syringe = (qty = 1) => ({ product: 'Insulin Syringe 1ml', qty });

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

test('splits units: BAC out of the discount, supplies out of the allowance', () => {
  const cart = [peptide(3), bac(5), syringe(2)];
  const { bacUnits, peptideUnits, discountUnits } = splitCartUnits(cart);

  assert.equal(bacUnits, 5);
  assert.equal(peptideUnits, 3, 'syringes must not earn free vials');
  assert.equal(discountUnits, 5, 'peptides + syringes, never BAC water');
});

test('free allowance is one vial per peptide, extras are billed', () => {
  const s = summarizeBacWater([peptide(3), bac(5)], 'USD', 1);

  assert.equal(s.freeUnits, 3);
  assert.equal(s.paidUnits, 2);
  assert.equal(s.charge, 2 * BAC_WATER_UNIT_PRICE_USD);
  assert.equal(s.shippedUnits, 5);
});

test('full allowance still ships when the customer adds no BAC water', () => {
  const s = summarizeBacWater([peptide(3)], 'USD', 1);

  assert.equal(s.freeUnits, 0, 'nothing in the cart to discount');
  assert.equal(s.paidUnits, 0);
  assert.equal(s.charge, 0);
  assert.equal(s.shippedUnits, 3, 'the gift survives a customer who never adds it');
});

test('fewer vials than peptides is entirely free', () => {
  const s = summarizeBacWater([peptide(4), bac(2)], 'USD', 1);

  assert.equal(s.freeUnits, 2);
  assert.equal(s.paidUnits, 0);
  assert.equal(s.charge, 0);
  assert.equal(s.shippedUnits, 4, 'still entitled to the full four');
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
});

test('CRC carts bill the converted price', () => {
  const s = summarizeBacWater([peptide(1), bac(3, 0)], 'CRC', 500);

  assert.equal(s.paidUnits, 2);
  assert.equal(s.charge, 2 * 5000);
});

test('water-only orders are held to a five vial floor', () => {
  assert.equal(checkBacOnlyMinimum([bac(5)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([bac(6)]).blocked, false);

  const short = checkBacOnlyMinimum([bac(2)]);
  assert.equal(short.blocked, true);
  assert.equal(short.shortfall, 3);
  assert.equal(short.minUnits, BAC_WATER_ONLY_MIN_UNITS);
});

test('any peptide exempts the cart from the floor', () => {
  assert.equal(checkBacOnlyMinimum([peptide(1), bac(1)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([syringe(1), bac(1)]).blocked, false);
  assert.equal(checkBacOnlyMinimum([]).blocked, false);
  assert.equal(checkBacOnlyMinimum([peptide(1)]).blocked, false);
});

test('the floor message names the shortfall, and clears once met', () => {
  assert.match(bacOnlyMinimumMessage([bac(2)], 'en'), /add 3 more/);
  assert.match(bacOnlyMinimumMessage([bac(2)], 'es'), /agregá 3 más/);
  assert.equal(bacOnlyMinimumMessage([bac(5)], 'en'), null);
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

test('a mixed BAC line splits into a billed line and a gift line', () => {
  const items = build([peptide(3), bac(5)]);

  assert.deepEqual(items, [
    { product: 'Semaglutide 5mg', qty: 3, price: 90 },
    { product: 'BAC Water 3ml', qty: 2, price: 10 },
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
      for (let syringes = 0; syringes <= 2; syringes++) {
        const cart = [
          ...(peptides ? [peptide(peptides)] : []),
          ...(syringes ? [syringe(syringes)] : []),
          ...(vials ? [bac(vials)] : []),
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
          `lines ${lineSum} != subtotal ${subtotal} for ${peptides}p/${vials}b/${syringes}s`,
        );
      }
    }
  }
});

// --- Only the 3ml is sold ---------------------------------------------------

test('reads the size out of a BAC listing name', () => {
  assert.equal(getBacWaterSizeMl('BAC Water 3ml'), 3);
  assert.equal(getBacWaterSizeMl('BAC Water 10ml'), 10);
  assert.equal(getBacWaterSizeMl('Agua Bacteriostática 2 ml'), 2);
  assert.equal(getBacWaterSizeMl('Bacteriostatic Water'), null, 'no size given');
  assert.equal(getBacWaterSizeMl('Semaglutide 5mg'), null, 'not BAC water at all');
});

test('only the 3ml listing is sellable', () => {
  assert.equal(isSellableBacWater('BAC Water 3ml'), true);
  assert.equal(isSellableBacWater('BAC Water 2ml'), false);
  assert.equal(isSellableBacWater('BAC Water 10ml'), false);
  assert.equal(isSellableBacWater('BACWater10ml'), false, 'no space before the unit');
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
