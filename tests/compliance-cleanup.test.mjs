/**
 * The card processor's review is the reason these rules exist. Each test here
 * stands for something that was actually wrong on the live site, so a later
 * edit that quietly puts it back fails here rather than at an underwriter.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import {
  DEFAULT_LANDING_PAGE_SETTINGS,
  DEFAULT_PUBLIC_PAGE_SETTINGS,
} from '../src/lib/landingContent.js';
import { resolveCategoryParam } from '../src/lib/catalogFilters.mjs';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

test('no footer link filters by a category value that does not exist', () => {
  // resolveCategoryParam falls back to 'all' for anything it cannot match, so a
  // wrong ?category= is not an error — it silently serves the whole catalog.
  // Every one of these links was pointing at a compound name, which is a
  // product name and never a category.
  const storedCategories = [
    { category: 'Weight Loss & Metabolism' },
    { category: 'Reconstitution Supply' },
    { category: 'Recovery & Healing' },
  ];

  for (const link of DEFAULT_LANDING_PAGE_SETTINGS.footerCategoryLinks) {
    const query = link.href.split('?')[1] || '';
    const category = new URLSearchParams(query).get('category');
    if (!category) continue; // ?search= links and the plain /catalog link
    assert.notEqual(
      resolveCategoryParam(storedCategories, category),
      'all',
      `${link.labelEn} filters by "${category}", which no product carries`,
    );
  }
});

test('compound links deep-link by search, which matches the product name', () => {
  const compounds = DEFAULT_LANDING_PAGE_SETTINGS.footerCategoryLinks
    .filter((link) => /^(BPC|CJC|GHK|GLP|Sema)/i.test(link.labelEn));

  assert.ok(compounds.length >= 4, 'expected the compound shortcuts to still be there');
  for (const link of compounds) {
    assert.match(link.href, /\?search=/, `${link.labelEn} must use ?search=, not ?category=`);
  }
});

test('the Info Center offers no dosing or injection guidance', () => {
  // The About page states we do not give dosing, administration or treatment
  // recommendations. A "how much to take, where to inject" card on the same
  // site contradicts that in a way an underwriter reads in a minute.
  const infoCenter = JSON.stringify(DEFAULT_PUBLIC_PAGE_SETTINGS.page_info_center);
  for (const banned of [/dosing/i, /inject/i, /how much to take/i, /dosificaci/i]) {
    assert.doesNotMatch(infoCenter, banned, `Info Center still mentions ${banned}`);
  }
});

test('every Info Center quick link points at a page that exists', () => {
  // All four used to point at blog slugs nobody ever wrote. They answered 200
  // with an empty body, which is worse than a 404: nothing tells the visitor,
  // or a crawler, that the page is not there.
  for (const link of DEFAULT_PUBLIC_PAGE_SETTINGS.page_info_center.quickLinks) {
    const path = link.href.split('?')[0];
    assert.doesNotMatch(path, /^\/blog\/./, `${link.labelEn} points at a specific blog post`);
    const route = `../src/app${path === '/' ? '' : path}/page.js`;
    assert.ok(existsSync(new URL(route, import.meta.url)), `${link.href} has no route at ${route}`);
  }
});

test('no page still advertises Retatrutide', () => {
  const shipped = JSON.stringify({
    landing: DEFAULT_LANDING_PAGE_SETTINGS,
    pages: DEFAULT_PUBLIC_PAGE_SETTINGS,
  });
  // Spanish inflects it, so a find/replace on the English spelling misses it.
  assert.doesNotMatch(shipped, /retatrutid/i);
});

test('the entry disclaimer is offered in both languages', async () => {
  const disclaimer = await read('../src/components/EntryDisclaimer.js');
  assert.match(disclaimer, /not intended for human or animal consumption/i);
  assert.match(disclaimer, /no están destinados al consumo/i);
  // Spanish is the site default, so the Spanish text is the one most visitors
  // are actually agreeing to.
  assert.match(disclaimer, /Sí, acepto/);
});

test('declining does not navigate the tab away', async () => {
  const disclaimer = await read('../src/components/EntryDisclaimer.js');
  // It redirected to Google, which an iframe cannot do — Google refuses to be
  // framed, so the embedded catalog was left showing a broken box.
  assert.doesNotMatch(disclaimer, /window\.location\.href\s*=/);
  assert.match(disclaimer, /setDeclined\(true\)/);
});

test('the entry disclaimer does not render inside the embedded catalog', async () => {
  const disclaimer = await read('../src/components/EntryDisclaimer.js');
  assert.match(disclaimer, /pathname\.startsWith\('\/embed'\)/);
  assert.match(disclaimer, /pathname\.startsWith\('\/admin'\)/);
});

test('the help bot takes the caller’s role from the session, not the request', async () => {
  const route = await read('../src/app/api/ai/route.js');
  // The session was verified and then the answer thrown away: any signed-in
  // sub-user could post isSuperAdmin: true and be handed the full super-admin
  // knowledge base.
  assert.doesNotMatch(route, /context\.isSuperAdmin/);
  assert.doesNotMatch(route, /context\.isSubUser/);
  assert.doesNotMatch(route, /context\.allowedTabs/);
  assert.match(route, /adminProfile\?\.is_superadmin/);
  assert.match(route, /resolveAdminTabAccess\(module\.id, adminProfile\)/);
});

test('the browser no longer sends its own privileges to the help bot', async () => {
  const bot = await read('../src/components/admin/AdminHelpBot.js');
  // The component still reads the profile for its own greeting and chips —
  // that is local rendering. What must not happen is sending any of it to the
  // route as the basis for an access decision.
  assert.match(bot, /context: \{ activeTab, lang \}/);
  // Nothing about the caller's privileges may appear anywhere in the request
  // body. Scoped to the fetch call so the component's own local use of the
  // profile — greeting, chips, header subtitle — does not trip it.
  const body = bot.slice(bot.indexOf('body: JSON.stringify('), bot.indexOf('});', bot.indexOf('body: JSON.stringify(')));
  for (const leaked of [/isSuperAdmin/, /isSubUser/, /allowedTabs/]) {
    assert.doesNotMatch(body, leaked, `the request body still carries ${leaked}`);
  }
});

test('the admin assistant is not rendered over the mobile nav bar', async () => {
  const bot = await read('../src/components/admin/AdminHelpBot.js');
  // The pill is fixed bottom-right at z-index 9000 and covered the quick-nav's
  // right-hand buttons outright. 1023px is where admin.css turns that bar on.
  assert.match(bot, /@media \(max-width: 1023px\)[\s\S]{0,120}display: none/);
});

test('a hidden promo is only fetched for the customer it was issued to', async () => {
  const webhook = await read('../src/app/api/whatsapp/webhook/route.js');
  // `issued_to.ilike.%${phoneTail}%` with an empty tail is `%%`, which selects
  // every hidden code in the table.
  assert.doesNotMatch(webhook, /issued_to\.ilike/);
  assert.match(webhook, /issued_to\.eq\."\$\{key\}"/);
  // Codes are filed under the strongest identity, so a customer who gave an
  // email holds one under email:, which the phone alone could never match.
  assert.match(webhook, /identityKeys\(\{ email: row\.customer_email \}\)/);
});
