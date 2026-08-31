import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_TIER_POINTS,
  PROSPECT_CATEGORIES,
  categoriesByTier,
  categoryTier,
  categoryTierPoints,
  prospectCategoryKey,
} from '../src/lib/prospectCategories.mjs';
import { scoreProspect } from '../src/lib/prospects.mjs';

test('the businesses that resell outrank the businesses that use one vial', () => {
  // The whole point of the list. A flat keyword match scored these the same.
  assert.equal(categoryTier('pharmacy_chain'), 1);
  assert.equal(categoryTier('gym'), 5);
  assert.ok(categoryTierPoints('pharmacy_chain') > categoryTierPoints('gym'));
});

test('tier 5 keeps the score every target category used to get', () => {
  // So a rescore can only lift a prospect, never demote one already worked.
  assert.equal(CATEGORY_TIER_POINTS[5], 45);
  assert.equal(scoreProspect({ category: 'gym' }).score, scoreProspect({ category: 'fitness centre' }).score);
});

test('a pharmacy stops scoring like a bad lead', () => {
  // Before: 5 out of 100, sorted below a CrossFit box.
  const pharmacy = scoreProspect({ category: 'pharmacy_chain', website_url: 'https://x.cr', city: 'San José' });
  const gym = scoreProspect({ category: 'gym', website_url: 'https://y.cr', city: 'San José' });
  assert.ok(pharmacy.score > gym.score);
  assert.ok(pharmacy.score >= 80);
});

test('a key survives the trip through a spreadsheet and a form', () => {
  assert.equal(prospectCategoryKey('pharmacy_chain'), 'pharmacy_chain');
  assert.equal(prospectCategoryKey('Pharmacy Chain'), 'pharmacy_chain');
  assert.equal(prospectCategoryKey('  PHARMACY-CHAIN '), 'pharmacy_chain');
  // But it never guesses at something that is not on the list.
  assert.equal(prospectCategoryKey('Farmacia'), null);
  assert.equal(prospectCategoryKey(''), null);
});

test('accented Spanish names match the keywords written for them', () => {
  // They did not before: stripping non-letters turned "Clínica Estética" into
  // "cl nica est tica", so 'clinica' matched no clinic that spelled its own
  // name correctly — in a market where nearly every one of them does.
  for (const name of [
    'Clínica Estética Belleza',
    'Droguería Intermed S.A.',
    'Laboratorio Clínico Páez',
    'Farmacéutica Nacional',
  ]) {
    assert.ok(scoreProspect({ organization_name: name }).score >= 45, `${name} should read as a target business`);
  }
});

test('the categories a directory returns still score without a key', () => {
  // Everything discovered from Google or OpenStreetMap arrives as free text.
  assert.equal(scoreProspect({ category: 'fitness_centre' }).score, scoreProspect({ category: 'gym' }).score);
  assert.ok(scoreProspect({ organization_name: 'Farmacia La Bomba' }).score >= 45);
  assert.ok(scoreProspect({ organization_name: 'Veterinaria San Rafael' }).score >= 45);
});

test('every category is unique, tiered, and searchable in Spanish', () => {
  const keys = PROSPECT_CATEGORIES.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length, 'keys must be unique');
  for (const entry of PROSPECT_CATEGORIES) {
    assert.ok(entry.tier >= 1 && entry.tier <= 5, `${entry.key} needs a tier`);
    assert.ok(entry.es && entry.label, `${entry.key} needs both labels`);
    assert.match(entry.key, /^[a-z0-9_]+$/, `${entry.key} must be a plain key`);
  }
});

test('the picker offers every category exactly once', () => {
  const groups = categoriesByTier();
  assert.deepEqual(groups.map((g) => g.tier), [1, 2, 3, 4, 5]);
  assert.equal(groups.flatMap((g) => g.categories).length, PROSPECT_CATEGORIES.length);
});
