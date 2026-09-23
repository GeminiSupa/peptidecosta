import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseDealOffer } from '../src/lib/dealOffers.mjs';
import { buildCheckoutBreakdown } from '../src/lib/checkoutBreakdown.mjs';
import { authoritativeCheckout } from '../src/lib/authoritativeCheckout.mjs';

/**
 * The catalog computes the total in the browser and the server computes it
 * again before saving. They are separate implementations of the same rules, so
 * a rule added to one and not the other shows the customer one price and
 * charges another. That is exactly what happened when flash sales shipped: the
 * card read $35, the checkout button read full price.
 *
 * These mirror the browser's getPromoDiscountAmount / getEffectiveVolumePct.
 */
const browserVolumePct = (offer, tierPct) => (
  offer ? (offer.kind !== 'volume' && offer.kind !== 'none' ? 0 : tierPct) : tierPct
);
const browserPromoDiscount = (offer, currency, discountableSubtotal, bacCharge = 0) => {
  if (!offer) return 0;
  if (offer.kind === 'flat') {
    const flat = Math.max(0, Number(offer.savings) || 0);
    return currency === 'USD' ? Math.round(flat * 100) / 100 : Math.round(flat);
  }
  if (offer.kind !== 'mix') return 0;
  const winningPct = Number(offer.offer?.discount_pct ?? offer.mix.discountPct) || 0;
  const base = (discountableSubtotal + bacCharge) * winningPct;
  return currency === 'USD' ? Math.round(base * 100) / 100 : Math.round(base);
};

const GHK = 'GHK-CU 50mg';
const TIRZ = 'Tirzepatide 20mg';
const products = [
  { id: '1', product: GHK, price_usd: '$70', price_crc: '31407', status: 'In Stock', inventory_count: 18 },
  { id: '2', product: TIRZ, price_usd: '$200', price_crc: '89734', status: 'In Stock', inventory_count: 50 },
];
const offers = { items: [
  { id: 'flash', type: 'flat', enabled: true, product_names: [GHK], discount_pct: 0.50 },
  { id: 'mix', type: 'mix', enabled: true, product_names: [GHK, TIRZ], min_units: 2, discount_pct: 0.10 },
] };

const carts = [
  [{ product: GHK, qty: 1 }],
  [{ product: GHK, qty: 2 }],
  [{ product: GHK, qty: 1 }, { product: TIRZ, qty: 1 }],
  [{ product: GHK, qty: 1 }, { product: TIRZ, qty: 3 }],
  [{ product: TIRZ, qty: 2 }],
];

for (const currency of ['USD', 'CRC']) {
  for (const items of carts) {
    const label = `${currency}: ${items.map((i) => `${i.qty}x ${i.product}`).join(' + ')}`;
    test(`browser and server agree on the discount — ${label}`, () => {
      const server = authoritativeCheckout({
        postedOrder: { currency, items, lang: 'en' },
        products, exchangeRate: 448.67, dealOffers: offers,
      });
      assert.equal(server.ok, true);

      const lines = items.map((item) => {
        const row = products.find((p) => p.product === item.product);
        const unitPrice = currency === 'USD'
          ? Number(String(row.price_usd).replace(/[^0-9.]/g, ''))
          : Number(String(row.price_crc).replace(/[^0-9.]/g, ''));
        return { product: item.product, qty: item.qty, unitPrice, inventoryCount: row.inventory_count };
      });
      const offer = chooseDealOffer(offers, lines, { volumePct: 0, bacCharge: 0 });

      const discountableSubtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
      assert.equal(browserPromoDiscount(offer, currency, discountableSubtotal), server.promoDiscount, 'discount must match');
      assert.equal(browserVolumePct(offer, 0), server.volumeDiscountPct, 'volume tier must match');
    });
  }
}

test('a flash sale shows its saving on the invoice breakdown', () => {
  const lines = [{ product: GHK, qty: 1, unitPrice: 70 }];
  const choice = chooseDealOffer(offers, lines, {});
  const breakdown = buildCheckoutBreakdown({ lines, dealChoice: choice });
  assert.equal(choice.kind, 'flat');
  assert.equal(breakdown.discountAmount, 35, 'the invoice must not show a zero saving');
  assert.equal(breakdown.discountPct, 0.50);
});

test('the order summary numbers add up on their own', () => {
  // The summary printed goods + shipping and then a smaller total, with no
  // line accounting for the difference. Whatever is shown must reconcile.
  for (const items of [
    [{ product: GHK, qty: 1 }],
    [{ product: GHK, qty: 2 }],
    [{ product: GHK, qty: 2 }, { product: TIRZ, qty: 1 }],
  ]) {
    const server = authoritativeCheckout({
      postedOrder: { currency: 'USD', items, lang: 'en' },
      products, exchangeRate: 448.67, dealOffers: offers,
    });
    const shown = server.subtotal - server.volumeDiscountAmount - server.promoDiscount + server.shipping;
    assert.equal(
      Math.round(shown * 100) / 100,
      server.total,
      `subtotal ${server.subtotal} - discounts (${server.volumeDiscountAmount} + ${server.promoDiscount}) + shipping ${server.shipping} must equal ${server.total}`,
    );
    assert.ok(server.promoDiscount > 0, 'a flash sale cart must show a discount, not a silent gap');
  }
});
