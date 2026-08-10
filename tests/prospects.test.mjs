import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isProspectsTableMissing,
  normalizeGooglePlace,
  normalizeOpenStreetMapPlace,
  normalizeProspectInput,
  prospectSearchTerm,
  scoreProspect,
} from '../src/lib/prospects.mjs';
import {
  extractPublishedContacts,
  isPublicNetworkAddress,
} from '../src/lib/prospectWebEnrichment.mjs';

test('scores useful public business signals without inventing contact permission', () => {
  const result = scoreProspect({
    primary_type: 'fitness_center',
    website_url: 'https://example.test',
    phone: '+506 2222 2222',
    rating: 4.7,
    user_rating_count: 48,
    city: 'Escazú',
  });

  assert.equal(result.score, 85);
  assert.deepEqual(result.reasons, [
    'Target business category',
    'Active business website',
    'Public business phone',
    'Strong public rating',
  ]);
});

test('normalizes Google Places details into the prospect shape', () => {
  const result = normalizeGooglePlace({
    id: 'place_123',
    displayName: { text: 'Escazú Performance Lab' },
    primaryType: 'sports_medicine_clinic',
    formattedAddress: 'Escazú, San José, Costa Rica',
    internationalPhoneNumber: '+506 2222 2222',
    websiteUri: 'https://lab.example',
    googleMapsUri: 'https://maps.google.com/?cid=123',
    location: { latitude: 9.918, longitude: -84.139 },
    rating: 4.8,
    userRatingCount: 32,
  });

  assert.equal(result.source_provider, 'google_places');
  assert.equal(result.source_external_id, 'place_123');
  assert.equal(result.organization_name, 'Escazú Performance Lab');
  assert.equal(result.latitude, 9.918);
  assert.equal(result.longitude, -84.139);
  assert.equal(result.phone, '+506 2222 2222');
  assert.ok(result.fit_score >= 75);
});

test('normalizes free OpenStreetMap results with public contact tags', () => {
  const result = normalizeOpenStreetMapPlace({
    osm_type: 'node',
    osm_id: 123,
    lat: '9.9325',
    lon: '-84.0796',
    display_name: 'Centro Activo, San José, Costa Rica',
    namedetails: { name: 'Centro Activo' },
    type: 'fitness_centre',
    address: { city: 'San José', state: 'San José', country: 'Costa Rica' },
    extratags: {
      website: 'centroactivo.example',
      'contact:phone': '+506 2222 2222',
      'contact:email': 'info@centroactivo.example',
    },
  });

  assert.equal(result.source_provider, 'openstreetmap');
  assert.equal(result.source_external_id, 'node:123');
  assert.equal(result.email, 'info@centroactivo.example');
  assert.equal(result.contact_permission_status, 'business_contact');
  assert.match(result.google_maps_url, /openstreetmap\.org/);
});

test('turns broad category labels into searchable OpenStreetMap terms', () => {
  assert.equal(prospectSearchTerm('Gyms and personal trainers'), 'gym');
  assert.equal(prospectSearchTerm('Nutrition practices'), 'nutritionist');
  assert.equal(prospectSearchTerm('BioLab Heredia'), 'BioLab Heredia');
});

test('extracts only explicitly published website contacts and contact links', () => {
  const result = extractPublishedContacts(`
    <html><body>
      <a href="mailto:ventas@example.co.cr">Email us</a>
      <a href="tel:+50622223333">Call</a>
      <a href="/contacto">Contacto</a>
      <script>const fake = 'hidden@example.com';</script>
    </body></html>
  `, 'https://example.co.cr/');

  assert.deepEqual(result.emails, ['ventas@example.co.cr']);
  assert.deepEqual(result.phones, ['+506 2222 3333']);
  assert.deepEqual(result.contactLinks, ['https://example.co.cr/contacto']);
});

test('blocks private and loopback networks during website enrichment', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.20.1.1', '192.168.1.5', '169.254.1.1', '::1', 'fd00::1']) {
    assert.equal(isPublicNetworkAddress(address), false, address);
  }
  assert.equal(isPublicNetworkAddress('1.1.1.1'), true);
  assert.equal(isPublicNetworkAddress('2606:4700:4700::1111'), true);
});

test('manual input defaults to an isolated prospect with unknown permission', () => {
  const result = normalizeProspectInput({
    organization_name: '  Central Valley Strength  ',
    website_url: 'cvstrength.example',
    latitude: '9.9',
    longitude: '-84.1',
  });

  assert.equal(result.organization_name, 'Central Valley Strength');
  assert.equal(result.website_url, 'https://cvstrength.example/');
  assert.equal(result.status, 'discovered');
  assert.equal(result.contact_permission_status, 'unknown');
  assert.equal(result.latitude, 9.9);
});

test('recognizes missing prospect table errors from Postgres and PostgREST', () => {
  assert.equal(isProspectsTableMissing({ code: '42P01' }), true);
  assert.equal(isProspectsTableMissing({ code: 'PGRST205' }), true);
  assert.equal(isProspectsTableMissing({ code: '42703', message: 'column contact_source_url does not exist' }), true);
  assert.equal(isProspectsTableMissing({ message: "Could not find sales_prospects in the schema cache" }), true);
  assert.equal(isProspectsTableMissing({ code: '23505' }), false);
});
