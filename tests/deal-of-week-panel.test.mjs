import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { weekWindow, dealSafety } from '../src/lib/dealOfWeek.mjs';

const panel = fs.readFileSync('src/components/admin/DealOfWeekPanel.js', 'utf8');
const engine = fs.readFileSync('src/lib/dealsEngine.js', 'utf8');
const route = fs.readFileSync('src/app/api/admin/deals/route.js', 'utf8');
const dealSource = fs.readFileSync('src/lib/dealOfWeek.mjs', 'utf8');

// ---------------------------------------------------------------------------
// The end date does not depend on the products
// ---------------------------------------------------------------------------

test('the end of the week is known before any product is picked', () => {
  // The field used to read "Pick a product…" until the server preview answered,
  // which made the one fixed thing on the screen look like another decision.
  const window = weekWindow(new Date('2026-09-10T04:00:00Z'));
  assert.equal(window.endsAtDate, '2026-09-13'); // the coming Sunday, CR time
  assert.equal(window.rolledForward, false);
});

test('a deal set up on Sunday night runs to the following Sunday', () => {
  // Less than a day left is not a week of deal, so the window rolls forward —
  // and the panel has to be able to say so before a preview exists.
  const window = weekWindow(new Date('2026-09-13T20:00:00Z')); // Sunday 2pm CR
  assert.equal(window.rolledForward, true);
  assert.equal(window.endsAtDate, '2026-09-20');
});

test('the panel shows that date itself and no longer waits for the preview', () => {
  assert.match(panel, /const localWindow = useMemo\(\(\) => weekWindow\(new Date\(\)\), \[\]\);/);
  assert.match(panel, /const plannedWindow = preview\?\.window \|\| localWindow;/);
  assert.match(panel, /\{formatCrInstant\(plannedWindow\.endsAt\)\}/);
  assert.ok(!panel.includes("'Pick a product…'"), 'the Ends box still tells you to pick a product');
});

// ---------------------------------------------------------------------------
// One confirmation, not three
// ---------------------------------------------------------------------------

test('the launch button is not gated on tickboxes further up the form', () => {
  // Two tickboxes plus a dialog was three gates in front of one button.
  assert.match(panel, /disabled=\{!preview \|\| isLaunching \|\| isPreviewing \|\| outOfStockSelected\.length > 0\}/);
});

test('both confirmations are asked once, in the final review', () => {
  const modalAt = panel.indexOf('weekly-deal-modal-backdrop');
  assert.ok(modalAt > 0, 'the review dialog is gone');

  for (const marker of ['Confirm stock manually.', 'High-discount review:']) {
    const at = panel.indexOf(marker);
    assert.ok(at > modalAt, `"${marker}" is asked before the review dialog`);
    assert.equal(panel.indexOf(marker, at + 1), -1, `"${marker}" is asked twice`);
  }
});

test('the review dialog will not launch until they are ticked', () => {
  assert.match(panel, /\|\| \(untrackedStockSelected\.length > 0 && !allowUntrackedStock\)/);
  assert.match(panel, /\|\| Boolean\(preview\.safety\?\.needsConfirmation && !confirmedHighDiscount\)/);
});

// ---------------------------------------------------------------------------
// Planning and changing a deal while one is running
// ---------------------------------------------------------------------------

test('the setup form is on screen whether or not a deal is live', () => {
  // Hidden while live, next week could not be planned during this week and a
  // wrong percentage could only be fixed by ending the deal first.
  assert.match(panel, /\{\/\* ---------- Set up the next deal ----------[\s\S]*?\*\/\}\s*\{!loading && \(/);
  assert.ok(!panel.includes('{!loading && !live && ('), 'the form is still hidden while a deal runs');
});

test('launching while a deal is live replaces it rather than colliding', () => {
  // launchDeal refuses outright when one is already live, so the panel has to
  // ask for the replacement path instead.
  assert.match(panel, /action: live \? 'replace' : 'launch',/);
  assert.match(panel, /\{live \? 'Replace the live deal' : 'Launch deal'\}/);
});

test('replacing restores the old prices before marking the new ones down', () => {
  // The markdown is computed from the baseline snapshot. Restoring first is
  // what stops the new percentage being applied to an already-discounted price.
  assert.match(engine, /export async function replaceLiveDeal\(options\)/);
  const fn = engine.slice(engine.indexOf('export async function replaceLiveDeal'));
  const endAt = fn.indexOf('await endDeal(live);');
  const launchAt = fn.indexOf('await launchDeal(options);');
  assert.ok(endAt > 0 && launchAt > endAt, 'the old deal is not ended before the new one launches');
});

test('a replacement is validated before anything is torn down', () => {
  // Otherwise a percentage over the limit takes the running deal down and puts
  // nothing in its place.
  const fn = engine.slice(engine.indexOf('export async function replaceLiveDeal'));
  const safetyAt = fn.indexOf('dealSafety(');
  const productsAt = fn.indexOf('await resolveProducts(');
  const endAt = fn.indexOf('await endDeal(live);');
  assert.ok(safetyAt > 0 && safetyAt < endAt, 'the discount is not checked before ending the deal');
  assert.ok(productsAt > 0 && productsAt < endAt, 'the products are not checked before ending the deal');
});

test('a failed replacement says what state the prices are in', () => {
  // "Could not launch" alone leaves the admin guessing whether the shop is
  // discounted, half discounted, or at full price.
  assert.match(engine, /every price is back to normal/);
  assert.match(engine, /Nothing is discounted right now/);
});

test('the API exposes replace', () => {
  assert.match(route, /if \(action === 'replace'\)/);
  assert.match(route, /replaceLiveDeal\(\{/);
});

// ---------------------------------------------------------------------------
// The draft belongs to the business, not to one browser
// ---------------------------------------------------------------------------

test('the saved draft is read from the server, with the browser as fallback', () => {
  assert.match(route, /getDealDraft\(supabase\)/);
  assert.match(panel, /if \(!draftHydratedRef\.current\) hydrateDraft\(data\.draft \|\| null\);/);
  assert.match(panel, /draft = JSON\.parse\(localStorage\.getItem\('weekly_deal_draft_v2'\) \|\| 'null'\)/);
});

test('nothing is saved before the stored draft has been read', () => {
  // The saving effect otherwise fires on the empty starting form and writes
  // that blank over the real draft while it is still loading.
  assert.match(panel, /if \(!draftHydratedRef\.current\) return;/);
});

test('the draft is not re-applied after a launch', () => {
  // load() runs again after launching; re-hydrating there would put the setup
  // that was just launched straight back into the form.
  assert.match(panel, /\/\/ Only on the first load\./);
});

test('saving is debounced, and a failed save never interrupts setup', () => {
  assert.match(panel, /action: 'save_draft',/);
  assert.match(panel, /\}, 1200\);/);
  assert.match(panel, /\}\)\.catch\(\(\) => \{/);
});

test('an empty selection clears the draft rather than storing a blank one', () => {
  assert.match(panel, /draft: selected\.length > 0 \? \{ selected, percent, titleEn, titleEs \} : null,/);
  assert.match(engine, /if \(selected\.length === 0\) return null;/);
});

test('the draft does not pollute the deal history', () => {
  // listDeals reads every row for the "Past deals" card, so a draft rewritten
  // on each keystroke would fill that history with deals that never ran.
  assert.match(engine, /const DRAFT_SETTING_ID = 'weekly_deal_draft';/);
  assert.match(engine, /Deliberately NOT a `status: 'draft'` row in the deals table/);
});

// ---------------------------------------------------------------------------
// The banner fields are no longer in the way
// ---------------------------------------------------------------------------

test('the banner wording is folded away but says when it is set', () => {
  // Both fields write themselves and are blank on almost every deal, but a
  // custom one hidden behind a collapsed section would be invisible.
  assert.match(panel, /Write the banner myself/);
  assert.match(panel, /\{!showAdvanced && \(titleEn\.trim\(\) \|\| titleEs\.trim\(\)\) && \(/);
  assert.match(panel, /\(custom text set\)/);
});

// ---------------------------------------------------------------------------
// Stacking: the number typed in the box is not the number a bulk buyer pays
// ---------------------------------------------------------------------------

test('the safety check reads the volume tier actually in force', () => {
  // Both tiers were hardcoded here, and the 10+ one was wrong for the whole of
  // any bulk week that raised the rate.
  const at20 = dealSafety(0.15, { tenPlusPct: 20 });
  const at35 = dealSafety(0.15, { tenPlusPct: 35 });
  assert.equal(at20.stackedAtTen, 32);
  assert.equal(at35.stackedAtTen, 44.75);
});

test('a deal that would breach the combined cap is refused at the real rate', () => {
  // 40% off looked safe at "52%" while the tier was assumed to be 20%. With the
  // tier at 35% it really gives away 61%, past the 55% limit that exists to
  // refuse exactly this.
  const assumed = dealSafety(0.4, { confirmedHighDiscount: true, tenPlusPct: 20 });
  const real = dealSafety(0.4, { confirmedHighDiscount: true, tenPlusPct: 35 });
  assert.equal(assumed.ok, true, 'the old assumption let this through');
  assert.equal(real.ok, false);
  assert.equal(real.stackedAtTen, 61);
  assert.match(real.error, /35% 10\+ vial discount/);
});

test('the tiers used are reported back, so the screen can name them', () => {
  const safety = dealSafety(0.15, { tenPlusPct: 35 });
  assert.equal(safety.tenPlusPct, 35);
  assert.equal(safety.fivePlusPct, 15);
});

test('the live rate is the default, not a hardcoded 20', () => {
  assert.match(dealSource, /tenPlusPct = tenPlusDiscountPct\(\),/);
  assert.match(dealSource, /fivePlusPct = STANDARD_FIVE_PLUS_PCT,/);
  assert.ok(
    !/stackedDiscountPercent\(discountPct, 20\)/.test(dealSource),
    'the 10+ tier is still hardcoded to 20',
  );
});

test('the panel warns about stacking before anything is picked', () => {
  // It used to be one clause at the end of the intro paragraph, which is not
  // where anyone looks before typing a number into a box marked "discount".
  assert.match(panel, /Important: this discount stacks on top of the volume discount/);
  assert.match(panel, /It is not one or the other/);
  const noteAt = panel.indexOf('Important: this discount stacks');
  const formAt = panel.indexOf('Extra discount (%)');
  assert.ok(noteAt > 0 && noteAt < formAt, 'the warning sits below the discount box');
});

test('the worked example is computed, not written out', () => {
  // A hand-written "so 15% becomes 32%" goes stale the moment a bulk week moves
  // the tier, which is the same failure this whole fix is about.
  assert.match(panel, /tenPlusPct: tenPlus|const tenPlus = tenPlusDiscountPct\(\);/);
  assert.match(panel, /stackedDiscountPercent\(dealPct \/ 100, tenPlus\)/);
  assert.ok(!panel.includes('their 15% volume discount on top'), 'a hardcoded 15% is still printed');
});

test('the preview names which tier each stacked figure used', () => {
  assert.match(panel, /At 5\+ vials \(\+\{preview\.safety\?\.fivePlusPct \?\? tiers\.fivePlus\}%\)/);
  assert.match(panel, /At 10\+ vials \(\+\{preview\.safety\?\.tenPlusPct \?\? tiers\.tenPlus\}%\)/);
});

test('a bulk week says when the raised tier drops back', () => {
  assert.match(panel, /bulk week — back to 20% after/);
});
