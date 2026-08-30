import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cmsFieldMatches,
  cmsPageLabel,
  cmsSearchStyle,
  cmsSearchText,
  escapeCssString,
  normalizeCmsSearchTerm,
} from '../src/lib/cmsSearch.mjs';

test('no search means no stylesheet at all', () => {
  assert.equal(cmsSearchStyle(''), '');
  assert.equal(cmsSearchStyle('   '), '');
  assert.equal(cmsSearchStyle(undefined), '');
});

test('a search hides every field and brings back the matches', () => {
  const css = cmsSearchStyle('support email');
  assert.match(css, /\.cms-filtering \[data-cms-search\] \{ display: none; \}/);
  assert.match(css, /\[data-cms-search\*="support email" i\] \{ display: block; \}/);
});

test('groups and sections left empty are hidden with their headings', () => {
  const css = cmsSearchStyle('whatsapp');
  assert.match(css, /\.cms-group:not\(:has\(\[data-cms-search\*="whatsapp" i\]\)\)/);
  assert.match(css, /\.cms-section:not\(:has\(\[data-cms-search\*="whatsapp" i\]\)\)/);
});

test('every rule is scoped so it cannot leak into normal editing', () => {
  for (const rule of cmsSearchStyle('hero').split('\n')) {
    assert.ok(rule.startsWith('.cms-filtering '), `unscoped rule: ${rule}`);
  }
});

test('a typed quote cannot break out of the selector', () => {
  // The term is interpolated into a stylesheet, so an unescaped quote would
  // end the selector and let the rest of the input be parsed as CSS.
  const css = cmsSearchStyle('say "hi"');
  assert.ok(!/[^\\]"hi"/.test(css), `quote escaped out of the selector: ${css}`);
  assert.match(css, /\\"hi\\"/);
  assert.equal(escapeCssString('a\\b"c'), 'a\\\\b\\"c');
  assert.equal(escapeCssString('a\nb'), 'a b');
});

test('search is whitespace-forgiving and case-blind', () => {
  assert.equal(normalizeCmsSearchTerm('  Support   Email '), 'Support Email');
  assert.equal(cmsFieldMatches('Contact Support Email', 'support email'), true);
  assert.equal(cmsFieldMatches('Contact Support Email', 'SUPPORT'), true);
  assert.equal(cmsFieldMatches('Contact Support Email', 'promo'), false);
  // An empty search matches everything, so the count reads as "all of them".
  assert.equal(cmsFieldMatches('anything', ''), true);
});

test('a field is findable by the page it lives on', () => {
  // Most fields are labelled only "Hero title EN"; the page is what someone
  // actually types.
  assert.equal(cmsPageLabel('page_info_center'), 'Info Center');
  assert.equal(cmsPageLabel('page_affiliate'), 'Affiliate');
  assert.equal(cmsPageLabel(''), '');
  assert.equal(cmsSearchText('page_affiliate', 'Hero title EN', 'heroTitleEn'), 'Affiliate Hero title EN heroTitleEn');
  assert.equal(cmsFieldMatches(cmsSearchText('page_affiliate', 'Hero title EN'), 'affiliate'), true);
});
