import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PUBLIC_PAGE_SETTINGS, DEFAULT_LANDING_PAGE_SETTINGS } from '../src/lib/landingContent.js';
import { getVolumeDiscountPct } from '../src/lib/pricing.js';

/**
 * The marketing copy and the cart maths are written in two different files, and
 * they had drifted apart in both directions:
 *
 *   - the landing section claimed the 5-vial discount needed five of the SAME
 *     product and never mentioned the 20% tier, while the promo banner running
 *     above it said products could be mixed;
 *   - the Bulk Discounts page — the page whose entire job is selling this —
 *     advertised 10% and 15% where the cart charges 15% and 20%.
 *
 * These tests read the percentages back out of the copy and check them against
 * getVolumeDiscountPct, so the next edit to either side has to keep them
 * honest.
 */

const percentagesIn = (text) => (String(text).match(/(\d+)\s*%/g) || []).map((m) => parseInt(m, 10));

test('the bulk tier table advertises the discount the cart actually applies', () => {
  const { tiers } = DEFAULT_PUBLIC_PAGE_SETTINGS.page_bulk_discounts;

  const fiveVial = tiers.find((t) => t.labelEn.startsWith('5+'));
  const tenVial = tiers.find((t) => t.labelEn.startsWith('10+'));

  assert.equal(percentagesIn(fiveVial.valueEn)[0], getVolumeDiscountPct(5));
  assert.equal(percentagesIn(fiveVial.valueEs)[0], getVolumeDiscountPct(5));
  assert.equal(percentagesIn(tenVial.valueEn)[0], getVolumeDiscountPct(10));
  assert.equal(percentagesIn(tenVial.valueEs)[0], getVolumeDiscountPct(10));
});

test('the landing bulk blurb quotes both tiers, in both languages', () => {
  const { bulkTextEn, bulkTextEs } = DEFAULT_LANDING_PAGE_SETTINGS;

  for (const [lang, text] of [['en', bulkTextEn], ['es', bulkTextEs]]) {
    const pcts = percentagesIn(text);
    assert.ok(
      pcts.includes(getVolumeDiscountPct(5)),
      `${lang} blurb should quote the 5-vial rate (${getVolumeDiscountPct(5)}%): ${text}`
    );
    assert.ok(
      pcts.includes(getVolumeDiscountPct(10)),
      `${lang} blurb should quote the 10-vial rate (${getVolumeDiscountPct(10)}%): ${text}`
    );
  }
});

test('the landing blurb does not restrict the discount to one product', () => {
  const { bulkTextEn, bulkTextEs } = DEFAULT_LANDING_PAGE_SETTINGS;
  // getVolumeDiscountPct counts vials across the whole cart, so any wording
  // that ties the threshold to a single product is factually wrong.
  assert.doesNotMatch(bulkTextEn, /same product/i);
  assert.doesNotMatch(bulkTextEs, /mismo producto/i);
});

test('the wholesale terms still say products can be mixed', () => {
  const { terms } = DEFAULT_PUBLIC_PAGE_SETTINGS.page_bulk_discounts;
  const joined = terms.map((t) => `${t.labelEn} ${t.labelEs}`).join(' ');
  assert.match(joined, /mix and match/i);
  assert.match(joined, /combinar diferentes/i);
});
