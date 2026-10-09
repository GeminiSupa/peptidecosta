import test from 'node:test';
import assert from 'node:assert/strict';
import { authoritativeCheckout } from '../src/lib/authoritativeCheckout.mjs';
import { calculateAdminOrderTotals } from '../src/lib/adminOrderTotals.mjs';
import {
  DISCOUNT_MODE_AUTO,
  DISCOUNT_MODE_CUSTOM,
  DISCOUNT_MODE_NONE,
  previewAutomaticDiscount,
  resolveManualOrderDiscountMode,
} from '../src/lib/manualOrderDiscount.mjs';

/**
 * A manual order is priced twice, exactly like a storefront order: the New
 * Order form previews a total for the agent on the phone, and the create route
 * re-prices it with authoritativeCheckout before saving. The flash-sale
 * breakage this is modelled on showed ₡15,704 on the card and charged ₡33,907,
 * so the two must be held together by a test rather than by hope.
 */
const GHK = 'GHK-CU 50mg';
const TIRZ = 'Tirzepatide 20mg';
const EXCHANGE_RATE = 448.67;

const products = [
  { id: '1', product: GHK, price_usd: '$70', price_crc: '31407', status: 'In Stock', inventory_count: 18 },
  { id: '2', product: TIRZ, price_usd: '$200', price_crc: '89734', status: 'In Stock', inventory_count: 50 },
];
// The admin page's own product shape: camelCase, and the price already resolved
// into the order's currency by the form.
const adminProducts = products.map((row) => ({ product: row.product, inventoryCount: row.inventory_count }));

const flashSale = {
  id: 'deal-flash',
  pricing_mode: 'offers',
  product_names: [GHK],
  offers: { items: [{ id: 'flash', type: 'flat', enabled: true, product_names: [GHK], discount_pct: 0.5 }] },
};
const weeklyMix = {
  id: 'deal-weekly',
  pricing_mode: 'offers',
  product_names: [GHK, TIRZ],
  offers: { items: [{ id: 'mix', type: 'mix', enabled: true, product_names: [GHK, TIRZ], min_units: 5, discount_pct: 0.1 }] },
};
const pooled = {
  id: 'deal-weekly',
  pricing_mode: 'offers',
  product_names: [GHK, TIRZ],
  offers: { items: [...weeklyMix.offers.items, ...flashSale.offers.items] },
};

const unitPrice = (product, currency) => {
  const row = products.find((p) => p.product === product);
  return currency === 'USD'
    ? Number(String(row.price_usd).replace(/[^0-9.]/g, ''))
    : Number(String(row.price_crc).replace(/[^0-9.]/g, ''));
};
const formItems = (cart, currency) => cart.map((line) => ({
  product: line.product,
  qty: line.qty,
  price: unitPrice(line.product, currency),
}));

const carts = [
  [{ product: GHK, qty: 1 }],
  [{ product: GHK, qty: 2 }],
  [{ product: GHK, qty: 1 }, { product: TIRZ, qty: 1 }],
  // Five vials: the volume tier is in the running against the offers.
  [{ product: GHK, qty: 1 }, { product: TIRZ, qty: 4 }],
  [{ product: GHK, qty: 3 }, { product: TIRZ, qty: 3 }],
  [{ product: TIRZ, qty: 2 }],
];

for (const deal of [flashSale, weeklyMix, pooled, null]) {
  for (const currency of ['USD', 'CRC']) {
    for (const cart of carts) {
      const label = `${deal ? deal.offers.items.map((o) => o.type).join('+') : 'no deal'} · ${currency} · ${cart.map((i) => `${i.qty}x ${i.product}`).join(' + ')}`;

      test(`manual order form and create route agree — ${label}`, () => {
        const items = formItems(cart, currency);
        const server = authoritativeCheckout({
          postedOrder: { currency, items: cart, lang: 'en' },
          products,
          exchangeRate: EXCHANGE_RATE,
          dealOffers: deal?.offers || null,
          keepPostedGifts: true,
        });
        assert.equal(server.ok, true);

        const auto = previewAutomaticDiscount({ items, deal, products: adminProducts, currency });
        const preview = calculateAdminOrderTotals(items, 0, {
          volumeDiscountPct: 0,
          replaceVolumeDiscount: true,
          promoDiscountAmount: auto.offerDiscount,
        });

        assert.equal(auto.volumePct, server.volumeDiscountPct, 'volume percentage must match');
        // Rounding is the server's job; the preview is compared to the cent
        // (USD) or the colón, which is the tolerance the storefront uses.
        // The create route charges the shipping the agent typed, not the
        // storefront's own shipping rule, so it prices goods-only:
        // `authoritative.total - authoritative.shipping`. The preview is
        // compared the same way, with no shipping on either side.
        const serverGoods = server.total - server.shipping;
        const tolerance = currency === 'USD' ? 0.011 : 1;
        assert.ok(
          Math.abs(preview.total - serverGoods) <= tolerance,
          `preview ${preview.total} vs server ${serverGoods}`,
        );
      });
    }
  }
}

test('a bundle offer is paid in free vials, not money', () => {
  const bundle = {
    id: 'deal-bundle',
    pricing_mode: 'offers',
    product_names: [GHK],
    offers: { items: [{ id: 'b', type: 'bundle', enabled: true, product_names: [GHK], buy_qty: 2, free_qty: 1 }] },
  };
  const items = formItems([{ product: GHK, qty: 2 }], 'USD');
  const auto = previewAutomaticDiscount({ items, deal: bundle, products: adminProducts, currency: 'USD' });

  assert.equal(auto.kind, 'bundle');
  assert.equal(auto.offerDiscount, 0, 'the total must not move');
  assert.equal(auto.volumePct, 0, 'a winning offer switches the volume tier off');
  assert.deepEqual(auto.freeLines.map((line) => `${line.qty} x ${line.product}`), [`1 x ${GHK}`]);
});

test('a shelf-mode deal is left to the catalog prices', () => {
  const shelf = { id: 'd', pricing_mode: 'shelf', product_names: [GHK], discount_pct: 0.3, offers: null };
  const items = formItems([{ product: GHK, qty: 1 }], 'USD');
  const auto = previewAutomaticDiscount({ items, deal: shelf, products: adminProducts, currency: 'USD' });

  assert.equal(auto.offerDiscount, 0);
  assert.equal(auto.kind, 'none');
});

test('the volume tier still shows when no deal is running', () => {
  const items = formItems([{ product: TIRZ, qty: 5 }], 'USD');
  const auto = previewAutomaticDiscount({ items, deal: null, products: adminProducts, currency: 'USD' });

  assert.equal(auto.kind, 'volume');
  assert.ok(auto.volumePct > 0, 'five vials reach the tier');
  assert.match(auto.label, /Volume discount/);
});

test('an empty cart has no discount and no crash', () => {
  const auto = previewAutomaticDiscount({ items: [], deal: pooled, products: adminProducts, currency: 'USD' });
  assert.equal(auto.kind, 'none');
  assert.equal(auto.offerDiscount, 0);
  assert.equal(auto.label, '');
});

test('the form nudges a cart that is one vial short of Mix & Match', () => {
  const items = formItems([{ product: TIRZ, qty: 2 }], 'USD');
  const auto = previewAutomaticDiscount({ items, deal: weeklyMix, products: adminProducts, currency: 'USD' });

  assert.equal(auto.kind, 'none');
  assert.match(auto.nudge, /3 more|add/i);
});

test('the posted mode decides, and old callers keep their old pricing', () => {
  assert.equal(resolveManualOrderDiscountMode({ discount_mode: 'custom' }), DISCOUNT_MODE_CUSTOM);
  assert.equal(resolveManualOrderDiscountMode({ discount_mode: 'none' }), DISCOUNT_MODE_NONE);
  assert.equal(resolveManualOrderDiscountMode({}), DISCOUNT_MODE_AUTO);
  assert.equal(resolveManualOrderDiscountMode({ discount_mode: 'nonsense' }), DISCOUNT_MODE_AUTO);
  // A caller written before discount_mode existed: a typed figure meant the
  // automatic tier stood aside, and it still does.
  assert.equal(
    resolveManualOrderDiscountMode({ manual_discount_type: 'percentage', manual_discount_value: 25 }),
    DISCOUNT_MODE_CUSTOM,
  );
  assert.equal(resolveManualOrderDiscountMode({ apply_volume_discount: false }), DISCOUNT_MODE_NONE);
  assert.equal(resolveManualOrderDiscountMode({ apply_volume_discount: true }), DISCOUNT_MODE_AUTO);
  // A zero is not a discount.
  assert.equal(
    resolveManualOrderDiscountMode({ manual_discount_type: 'percentage', manual_discount_value: 0 }),
    DISCOUNT_MODE_AUTO,
  );
});

test('custom and none both keep the running sale off the order', () => {
  const items = formItems([{ product: GHK, qty: 2 }], 'USD');
  const auto = previewAutomaticDiscount({ items, deal: flashSale, products: adminProducts, currency: 'USD' });
  assert.ok(auto.offerDiscount > 0, 'the sale would have discounted this cart');

  for (const mode of [DISCOUNT_MODE_CUSTOM, DISCOUNT_MODE_NONE]) {
    const totals = calculateAdminOrderTotals(items, 0, {
      volumeDiscountPct: 0,
      promoDiscountAmount: 0,
      replaceVolumeDiscount: true,
      manualDiscountType: mode === DISCOUNT_MODE_CUSTOM ? 'percentage' : null,
      manualDiscountValue: mode === DISCOUNT_MODE_CUSTOM ? 25 : 0,
    });
    const expected = mode === DISCOUNT_MODE_CUSTOM ? 140 * 0.75 : 140;
    assert.equal(totals.total, expected, `${mode} charges ${expected}`);
  }
});

/**
 * Editing an order re-prices it. The order panel previews that in the browser
 * and /api/admin/orders/update does it again before saving, so the same
 * divergence that let a flash sale show one price and charge another applies
 * here too - with the extra wrinkle that an edited order keeps the volume rate
 * it was priced at, and the offers must be weighed against that same rate.
 */
for (const storedPct of [0, 15, 35]) {
  for (const currency of ['USD', 'CRC']) {
    const cart = [{ product: GHK, qty: 2 }, { product: TIRZ, qty: 4 }];
    test(`order panel and update route agree on an edit — ${currency}, tier ${storedPct}%`, () => {
      const items = formItems(cart, currency);
      const server = authoritativeCheckout({
        postedOrder: { currency, items: cart, lang: 'en' },
        products,
        exchangeRate: EXCHANGE_RATE,
        dealOffers: pooled.offers,
        volumeDiscountPctOverride: storedPct,
        keepPostedGifts: true,
      });
      assert.equal(server.ok, true);

      const auto = previewAutomaticDiscount({
        items,
        deal: pooled,
        products: adminProducts,
        currency,
        volumePctOverride: storedPct,
      });
      const offerWon = auto.kind !== 'none' && auto.kind !== 'volume' && auto.offerDiscount > 0;
      const preview = calculateAdminOrderTotals(items, 0, {
        promoDiscountAmount: offerWon ? auto.offerDiscount : 0,
        volumeDiscountPct: offerWon ? 0 : storedPct,
        replaceVolumeDiscount: false,
      });

      const serverGoods = server.total - server.shipping;
      const tolerance = currency === 'USD' ? 0.011 : 1;
      assert.ok(
        Math.abs(preview.total - serverGoods) <= tolerance,
        `preview ${preview.total} vs server ${serverGoods}`,
      );
    });
  }
}

test('a stored 35% tier still beats a 10% Mix & Match on an edit', () => {
  const items = formItems([{ product: TIRZ, qty: 5 }], 'USD');
  const auto = previewAutomaticDiscount({
    items,
    deal: weeklyMix,
    products: adminProducts,
    currency: 'USD',
    volumePctOverride: 35,
  });
  assert.equal(auto.kind, 'volume', 'the rate the order was priced at wins');
  assert.equal(auto.volumePct, 35);
});

test('turning the automatic discount off keeps the offers out of an edit', () => {
  const items = formItems([{ product: GHK, qty: 2 }], 'USD');
  // What the panel passes when a negotiated discount replaces the tier.
  const auto = previewAutomaticDiscount({ items, deal: null, products: adminProducts, currency: 'USD' });
  assert.equal(auto.offerDiscount, 0);
  assert.equal(auto.kind, 'none');
});
