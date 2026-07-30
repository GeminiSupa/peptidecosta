import test from 'node:test';
import assert from 'node:assert/strict';
import {
  weekWindow,
  markdownUsd,
  formatUsdPrice,
  formatCrcPrice,
  snapshotBaseline,
  buildMarkdown,
  restorePayload,
  isDealLive,
  dealBannerText,
  toPercent,
  DEAL_DISCOUNT_LABEL,
} from '../src/lib/dealOfWeek.mjs';

// Costa Rica is UTC-6, so 23:59:59.999 CR is 05:59:59.999 UTC the NEXT day.
// Every expected endsAt below is a Monday morning in UTC for that reason.
const SUNDAY_2_AUG_END = '2026-08-03T05:59:59.999Z';

test('a midweek launch ends at the close of the coming Sunday, Costa Rica time', () => {
  // Thursday 30 Jul 2026, 10:00 CR = 16:00 UTC
  const window = weekWindow(new Date('2026-07-30T16:00:00Z'));
  assert.equal(window.endsAt, SUNDAY_2_AUG_END);
  assert.equal(window.endsAtDate, '2026-08-02');
  assert.equal(window.rolledForward, false);
});

test('the window starts the moment it is launched, not at the top of the week', () => {
  const launchedAt = new Date('2026-07-30T16:00:00Z');
  assert.equal(weekWindow(launchedAt).startsAt, launchedAt.toISOString());
});

test('a Monday launch still ends the same Sunday, giving the full week', () => {
  // Monday 27 Jul 2026, 09:00 CR = 15:00 UTC
  const window = weekWindow(new Date('2026-07-27T15:00:00Z'));
  assert.equal(window.endsAt, SUNDAY_2_AUG_END);
  assert.equal(window.rolledForward, false);
});

test('an early-Sunday launch keeps that same Sunday when a full day remains', () => {
  // Sunday 2 Aug 2026, 08:00 CR = 14:00 UTC — nearly 16 hours left, but the
  // 24-hour floor rolls it on rather than announcing a deal that dies tonight.
  const window = weekWindow(new Date('2026-08-02T14:00:00Z'));
  assert.equal(window.endsAtDate, '2026-08-09');
  assert.equal(window.rolledForward, true);
});

test('a Sunday-evening launch rolls to the following Sunday instead of expiring in hours', () => {
  // Sunday 2 Aug 2026, 20:00 CR = 3 Aug 02:00 UTC. Left alone this would be a
  // "Deal of the Week" with four hours in it.
  const window = weekWindow(new Date('2026-08-03T02:00:00Z'));
  assert.equal(window.endsAt, '2026-08-10T05:59:59.999Z');
  assert.equal(window.rolledForward, true);
});

test('the 24-hour floor is what rolls the window, and it can be relaxed', () => {
  // Same Sunday-evening instant, but a caller that genuinely wants tonight.
  const window = weekWindow(new Date('2026-08-03T02:00:00Z'), { minHours: 0 });
  assert.equal(window.endsAtDate, '2026-08-02');
  assert.equal(window.rolledForward, false);
});

test('a Saturday launch is short but not rolled forward — the week is nearly over by design', () => {
  // Saturday 1 Aug 2026, 12:00 CR = 18:00 UTC, ~36 hours left.
  const window = weekWindow(new Date('2026-08-01T18:00:00Z'));
  assert.equal(window.endsAt, SUNDAY_2_AUG_END);
  assert.equal(window.rolledForward, false);
});

test('the end boundary lands inside Sunday, never on Monday', () => {
  const endsAt = new Date(weekWindow(new Date('2026-07-30T16:00:00Z')).endsAt);
  const crWall = new Date(endsAt.getTime() - 6 * 60 * 60 * 1000);
  assert.equal(crWall.getUTCDay(), 0, 'still Sunday in Costa Rica');
  assert.equal(crWall.getUTCHours(), 23);
  assert.equal(crWall.getUTCMinutes(), 59);
});

test('markdown rounds to cents and leaves the base price alone on bad input', () => {
  assert.equal(markdownUsd('$125', 0.15), 106.25);
  assert.equal(markdownUsd('$99', 0.15), 84.15);
  // 15% off $70 is 59.5 exactly; no phantom third decimal.
  assert.equal(markdownUsd('$70', 0.15), 59.5);
  assert.equal(markdownUsd('$125', 0), 125, 'a zero discount is not a markdown');
  assert.equal(markdownUsd('$125', 1), 125, 'free is rejected, not applied');
  assert.equal(markdownUsd('', 0.15), 0);
});

test('prices are formatted the way the columns already hold them', () => {
  assert.equal(formatUsdPrice(125), '$125', 'whole dollars carry no decimals');
  assert.equal(formatUsdPrice(106.25), '$106.25');
  assert.equal(formatCrcPrice(56810.4), '₡56,810');
  assert.equal(formatUsdPrice(0), '');
  assert.equal(formatCrcPrice(0), '');
});

test('toPercent accepts both the fraction and the whole number', () => {
  assert.equal(toPercent(0.15), 15);
  assert.equal(toPercent(15), 15);
  assert.equal(toPercent(0), 0);
  assert.equal(toPercent(null), 0);
});

const GHK = {
  id: 'p1',
  product: 'GHK-Cu 50mg',
  price_usd: '$125',
  price_crc: '₡56,810',
  original_price_usd: null,
  original_price_crc: null,
  discount: 'Buy 5+ vials, get 15% off',
  sale_start_time: null,
  sale_end_time: null,
};

const RATE = 454.48;
const WINDOW = { startsAt: '2026-07-30T16:00:00.000Z', endsAt: SUNDAY_2_AUG_END };

test('a launch marks the price down and preserves the shelf price to strike through', () => {
  const markdown = buildMarkdown(snapshotBaseline(GHK), 0.15, WINDOW, RATE);

  assert.equal(markdown.price_usd, '$106.25');
  assert.equal(markdown.original_price_usd, '$125');
  assert.equal(markdown.sale_end_time, SUNDAY_2_AUG_END);
  // The catalog derives the ribbon from original vs current, so this pair is
  // what makes it read "SAVE 15%" with no badge code involved.
  assert.ok(
    Number(markdown.original_price_usd.slice(1)) > Number(markdown.price_usd.slice(1)),
    'original must exceed the sale price or the ribbon will not render'
  );
});

test('CRC is marked down too — the landing page and cart recovery quote that column', () => {
  const markdown = buildMarkdown(snapshotBaseline(GHK), 0.15, WINDOW, RATE);
  assert.equal(markdown.price_crc, '₡48,289');
  assert.equal(markdown.original_price_crc, '₡56,810');
  assert.notEqual(markdown.price_crc, GHK.price_crc);
});

test('the discount column is labelled so the sale window actually switches on', () => {
  // The catalog gates isSaleActive on this column being truthy, so a blank
  // label would silently produce a marked-down price with no ribbon.
  const markdown = buildMarkdown(snapshotBaseline(GHK), 0.15, WINDOW, RATE);
  assert.equal(markdown.discount, `15% ${DEAL_DISCOUNT_LABEL}`);
  assert.ok(markdown.discount);
});

test('relaunching over a live deal cannot compound the markdown', () => {
  const baseline = snapshotBaseline(GHK);
  const first = buildMarkdown(baseline, 0.15, WINDOW, RATE);

  // Second launch derives from the stored baseline, not the reduced shelf price.
  const second = buildMarkdown(baseline, 0.15, WINDOW, RATE);
  assert.equal(second.price_usd, first.price_usd);
  assert.equal(second.price_usd, '$106.25');

  // What it must never do: 15% off the already-discounted $106.25 -> $90.31.
  const compounded = buildMarkdown(
    { ...baseline, price_usd: first.price_usd },
    0.15,
    WINDOW,
    RATE
  );
  assert.equal(compounded.price_usd, '$90.31');
  assert.notEqual(second.price_usd, compounded.price_usd);
});

test('expiry restores every column a launch touched, byte for byte', () => {
  const baseline = snapshotBaseline(GHK);
  buildMarkdown(baseline, 0.15, WINDOW, RATE); // must not mutate the baseline

  const restored = restorePayload(baseline);
  assert.equal(restored.price_usd, GHK.price_usd);
  assert.equal(restored.price_crc, GHK.price_crc);
  assert.equal(restored.original_price_usd, null);
  assert.equal(restored.original_price_crc, null);
  assert.equal(restored.sale_start_time, null);
  assert.equal(restored.sale_end_time, null);
});

test('the bulk-pricing text in the discount column survives a deal', () => {
  // That column doubles as the free-text "Volume/Bulk Discount Info" shown in
  // the Products tab. Losing it would be an invisible edit to the product.
  const baseline = snapshotBaseline(GHK);
  assert.equal(restorePayload(baseline).discount, 'Buy 5+ vials, get 15% off');
});

test('a product already on a markdown gets its own original price back', () => {
  const alreadyDiscounted = {
    ...GHK,
    price_usd: '$110',
    original_price_usd: '$125',
    original_price_crc: '₡56,810',
  };
  const baseline = snapshotBaseline(alreadyDiscounted);
  const markdown = buildMarkdown(baseline, 0.15, WINDOW, RATE);

  // The deal price comes off the current shelf price of $110, not the old $125.
  assert.equal(markdown.price_usd, '$93.50');
  // And the pre-deal state comes back intact.
  assert.equal(restorePayload(baseline).original_price_usd, '$125');
  assert.equal(restorePayload(baseline).price_usd, '$110');
});

test('a deal is live only inside its own window and only while marked live', () => {
  const deal = { status: 'live', starts_at: WINDOW.startsAt, ends_at: WINDOW.endsAt };

  assert.equal(isDealLive(deal, new Date('2026-07-31T12:00:00Z')), true);
  assert.equal(isDealLive(deal, new Date('2026-07-30T15:59:00Z')), false, 'before it starts');
  assert.equal(isDealLive(deal, new Date('2026-08-03T06:00:01Z')), false, 'after Sunday closes');
  assert.equal(isDealLive({ ...deal, status: 'draft' }, new Date('2026-07-31T12:00:00Z')), false);
  assert.equal(isDealLive({ ...deal, status: 'ended' }, new Date('2026-07-31T12:00:00Z')), false);
  assert.equal(isDealLive(null), false);
});

test('banner copy names the product and says the discount stacks', () => {
  const deal = { discount_pct: 0.15, product_names: ['GHK-Cu 50mg'] };

  const en = dealBannerText(deal, 'en');
  assert.match(en, /DEAL OF THE WEEK/);
  assert.match(en, /15%/);
  assert.match(en, /GHK-Cu 50mg/);
  assert.match(en, /volume/i);

  const es = dealBannerText(deal, 'es');
  assert.match(es, /OFERTA DE LA SEMANA/);
  assert.match(es, /volumen/i);
});

test('banner copy lists several products readably', () => {
  const deal = { discount_pct: 0.2, product_names: ['GHK-Cu', 'BPC-157', 'TB-500'] };
  assert.match(dealBannerText(deal, 'en'), /GHK-Cu, BPC-157 and TB-500/);
  assert.match(dealBannerText(deal, 'es'), /GHK-Cu, BPC-157 y TB-500/);
});

test('custom titles override the generated copy per language', () => {
  const deal = {
    discount_pct: 0.15,
    product_names: ['GHK-Cu'],
    title_en: 'Copper week — 15% off GHK-Cu',
    title_es: '',
  };
  assert.equal(dealBannerText(deal, 'en'), 'Copper week — 15% off GHK-Cu');
  assert.match(dealBannerText(deal, 'es'), /OFERTA DE LA SEMANA/, 'blank ES still generates');
});

test('a deal with no discount produces no banner rather than an empty one', () => {
  assert.equal(dealBannerText({ discount_pct: 0, product_names: ['GHK-Cu'] }, 'en'), '');
});
