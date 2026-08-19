import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chunkProspects,
  distanceKmBetween,
  filterDiscoveryProspects,
  matchesProspectSearch,
  resolvedDistanceLimit,
} from '../src/lib/prospectFilters.mjs';

test('distance uses real coordinates and stays readable in kilometres', () => {
  const sanJose = { latitude: 9.9281, longitude: -84.0907 };
  const escazu = { latitude: 9.9187, longitude: -84.1399 };
  const distance = distanceKmBetween(sanJose, escazu);
  assert.ok(distance > 5 && distance < 6);
  assert.equal(distanceKmBetween(sanJose, {}), null);
});

test('phone search ignores spaces, punctuation, and country formatting', () => {
  const prospect = { organization_name: 'Example Gym', phone: '+506 8888-7777' };
  assert.equal(matchesProspectSearch(prospect, '88887777'), true);
  assert.equal(matchesProspectSearch(prospect, '+5068888'), true);
  assert.equal(matchesProspectSearch(prospect, 'example'), true);
  assert.equal(matchesProspectSearch(prospect, '22223333'), false);
});

test('preset and manual distance limits are bounded and validated', () => {
  assert.equal(resolvedDistanceLimit('25', ''), 25);
  assert.equal(resolvedDistanceLimit('custom', '17.5'), 17.5);
  assert.equal(resolvedDistanceLimit('custom', '-2'), null);
  assert.equal(resolvedDistanceLimit('custom', '5000'), 1000);
});

test('discovery filters combine contact, score, rating, saved state, and radius', () => {
  const center = { latitude: 9.9281, longitude: -84.0907 };
  const prospects = [
    { id: 'near', organization_name: 'Near', latitude: 9.93, longitude: -84.09, phone: '1', fit_score: 80, rating: 4.8 },
    { id: 'far', organization_name: 'Far', latitude: 10.5, longitude: -84.09, phone: '2', fit_score: 90, rating: 4.9 },
    { id: 'email', organization_name: 'Email', latitude: 9.94, longitude: -84.09, email: 'a@example.test', fit_score: 70, rating: 4.7 },
  ];
  const filtered = filterDiscoveryProspects(prospects, {
    center,
    contact: 'phone',
    distanceKm: 25,
    minRating: 4.5,
    minReviews: 0,
    minScore: 70,
    excludeSaved: true,
    isSaved: (prospect) => prospect.id === 'saved',
  });
  assert.deepEqual(filtered.map((prospect) => prospect.id), ['near']);
});

test('large selections are split into explicit safe batches', () => {
  assert.deepEqual(chunkProspects([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
