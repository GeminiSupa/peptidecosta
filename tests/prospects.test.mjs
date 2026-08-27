import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildProspectSearchQuery,
  dedupeAndRankProspects,
  expandAnchoredTagPattern,
  hasUsableProspectWhatsAppIdentity,
  isProspectsTableMissing,
  isRetryableOverpassStatus,
  matchesTargetCategory,
  prospectScoreTone,
  PROSPECT_SCORE_BANDS,
  overpassEndpoints,
  searchCacheTtlMs,
  SEARCH_CACHE_TTL_MS,
  DEGRADED_SEARCH_CACHE_TTL_MS,
  mergeRediscoveredProspect,
  upgradeContactPermission,
  normalizeGooglePlace,
  normalizeLinkedInProfileUrls,
  normalizeOpenStreetMapPlace,
  normalizeOverpassElement,
  normalizeProspectPeople,
  normalizeProspectInput,
  normalizeOptionalProspectDate,
  prospectInputError,
  prospectSearchTerm,
  prospectSearchProfile,
  scoreProspect,
} from '../src/lib/prospects.mjs';

test('manual prospect validation rejects hidden coordinate and date errors', () => {
  assert.match(prospectInputError({ latitude: 91, longitude: 10 }), /Latitude/);
  assert.match(prospectInputError({ latitude: 9.9 }), /both latitude and longitude/);
  assert.match(prospectInputError({ website_url: 'http://[broken' }), /website URL/);
  assert.match(prospectInputError({ next_follow_up_at: 'not-a-date' }), /follow-up date/);
  assert.equal(prospectInputError({ latitude: 9.9, longitude: -84.1, website_url: 'example.com' }), null);
  assert.match(prospectInputError({
    email_permission_status: 'business_contact',
  }), /source URL is required/i);
  assert.match(prospectInputError({
    whatsapp_permission_status: 'consented',
  }), /where or how WhatsApp consent was received/i);
  assert.equal(prospectInputError({
    email_permission_status: 'business_contact',
    email_permission_source_url: 'https://example.test/contact',
    email: 'team@example.test',
  }), null);
  assert.match(prospectInputError({
    whatsapp_permission_status: 'business_contact',
    whatsapp_permission_source_url: 'https://example.test/contact',
    phone: '123',
  }), /usable WhatsApp number/i);
  assert.equal(hasUsableProspectWhatsAppIdentity({ phone: '+506 8888 7777' }), true);

  const normalized = normalizeProspectInput({ organization_name: 'Out of range', latitude: 120, longitude: 300 });
  assert.equal(normalized.latitude, null);
  assert.equal(normalized.longitude, null);
  assert.equal(normalizeOptionalProspectDate('not-a-date'), null);
});
import {
  decodeCloudflareEmail,
  extractPublishedContacts,
  extractStructuredContacts,
  extractWhatsAppNumbers,
  isPublicNetworkAddress,
} from '../src/lib/prospectWebEnrichment.mjs';

test('commercial fit ignores contact details and permission', () => {
  const result = scoreProspect({
    primary_type: 'fitness_center',
    website_url: 'https://example.test',
    phone: '+506 2222 2222',
    rating: 4.7,
    user_rating_count: 48,
    city: 'Escazú',
  });

  assert.equal(result.score, 95);
  assert.deepEqual(result.reasons, [
    'Target business category',
    'Established web presence',
    'Business location identified',
    'Strong public rating',
    'Established review volume',
  ]);
  assert.ok(!result.reasons.some((reason) => /phone|email|permission/i.test(reason)));
});

test('the same business scores the same however its category is spelled', () => {
  const spellings = ['fitness_centre', 'fitness centre', 'Fitness_Center', 'sports_medicine_clinic', 'clinic'];
  for (const category of spellings) {
    assert.ok(
      matchesTargetCategory({ category }),
      `${category} should be recognised as a target category`,
    );
  }
  assert.ok(!matchesTargetCategory({ category: 'hardware', organization_name: 'Ferretería López' }));
});

test('an unmistakable name counts when the directory left the category blank', () => {
  assert.ok(matchesTargetCategory({ category: null, organization_name: 'Gimnasio Olimpo' }));
  assert.ok(matchesTargetCategory({ category: '', organization_name: 'CrossFit Escazú' }));
});

test('adding contacts and permission does not change commercial fit', () => {
  const business = {
    category: 'fitness centre',
    website_url: 'https://example.test',
    city: 'Escazú',
  };
  const base = scoreProspect(business);
  const withContacts = scoreProspect({
    ...business,
    phone: '+506 2222 2222',
    email: 'info@example.test',
    people: [{ full_name: 'Ana Ruiz', job_title: 'Owner' }],
    email_permission_status: 'business_contact',
    email_permission_basis: 'published_business_contact',
    email_permission_source_url: 'https://example.test/contact',
  });

  assert.equal(base.score, 70);
  assert.deepEqual(withContacts, base);
});

test('score bands describe the scale the scores are actually on', () => {
  assert.equal(prospectScoreTone(100), 'high');
  assert.equal(prospectScoreTone(70), 'high');
  assert.equal(prospectScoreTone(69), 'medium');
  assert.equal(prospectScoreTone(45), 'medium');
  assert.equal(prospectScoreTone(44), 'low');
  assert.equal(prospectScoreTone(0), 'low');
  // Every band has to be reachable, or the colour carries no information.
  assert.deepEqual(PROSPECT_SCORE_BANDS.map((band) => band.tone), ['high', 'medium', 'low']);
});

test('a well-tagged gym is not filed as a thin record', () => {
  const gym = normalizeOverpassElement({
    type: 'node',
    id: 7,
    lat: 9.93,
    lon: -84.08,
    tags: {
      name: 'Iron House Gym',
      leisure: 'fitness_centre',
      website: 'https://ironhouse.example',
      'contact:phone': '+506 2222 3333',
    },
  }, { country: 'Costa Rica', city: 'San José' });

  assert.equal(gym.category, 'fitness centre');
  assert.ok(gym.fit_reasons.includes('Target business category'));
  assert.equal(prospectScoreTone(gym.fit_score), 'high');
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
  assert.ok(result.fit_score >= 70);
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
  assert.equal(result.contact_permission_status, 'unknown');
  assert.equal(result.email_permission_status, 'unknown');
  assert.equal(result.whatsapp_permission_status, 'unknown');
  assert.match(result.google_maps_url, /openstreetmap\.org/);
});

test('turns broad category labels into searchable OpenStreetMap terms', () => {
  assert.equal(prospectSearchTerm('Gyms and personal trainers'), 'gym');
  assert.equal(prospectSearchTerm('Nutrition practices'), 'nutritionist');
  assert.equal(prospectSearchTerm('BioLab Heredia'), 'BioLab Heredia');
});

test('maps business searches to category-aware OpenStreetMap filters', () => {
  const gym = prospectSearchProfile('personal trainers');
  assert.equal(gym.term, 'gym');
  assert.ok(gym.tagFilters.some(([key]) => key === 'leisure'));
  assert.match(gym.namePattern, /fitness/);

  const custom = prospectSearchProfile('biotechnology accelerator');
  assert.equal(custom.term, 'biotechnology accelerator');
  assert.deepEqual(custom.tagFilters, []);
});

test('builds worldwide searches without forcing a country', () => {
  assert.equal(buildProspectSearchQuery('Gyms and personal trainers', 'Pakistan'), 'gym, Pakistan');
  assert.equal(buildProspectSearchQuery('laboratory', 'Berlin, Germany'), 'laboratory, Berlin, Germany');
  assert.equal(buildProspectSearchQuery('wellness center', ''), 'wellness');
});

test('normalizes detailed Overpass POIs and ranks complete matches first', () => {
  const base = normalizeOverpassElement({
    type: 'node',
    id: 99,
    lat: 33.68,
    lon: 73.04,
    tags: {
      name: 'Capital Fitness Club',
      leisure: 'fitness_centre',
      website: 'https://capitalfitness.example',
      phone: '+92 51 1234567',
      'addr:city': 'Islamabad',
    },
  }, { country: 'Pakistan', region: 'Islamabad Capital Territory' });
  assert.equal(base.source_external_id, 'node:99');
  assert.equal(base.country, 'Pakistan');
  assert.equal(base.website_url, 'https://capitalfitness.example/');

  const ranked = dedupeAndRankProspects([
    { ...base, website_url: null, phone: null, fit_score: 35 },
    { ...base, website_url: 'https://capitalfitness.example/', phone: '+92 51 1234567', fit_score: 60 },
    { ...base, source_external_id: 'node:100', organization_name: 'Unrelated Hall', fit_score: 20 },
  ], 'gym');
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].organization_name, 'Capital Fitness Club');
  assert.equal(ranked[0].phone, '+92 51 1234567');
});

test('extracts only explicitly published website contacts and contact links', () => {
  const result = extractPublishedContacts(`
    <html><body>
      <a href="mailto:ventas@example.co.cr">Email us</a>
      <a href="tel:+50622223333">Call</a>
      <a href="/contacto">Contacto</a>
      <a href="https://www.linkedin.com/in/jane-example/?trk=site">LinkedIn</a>
      <script>const fake = 'hidden@example.com';</script>
    </body></html>
  `, 'https://example.co.cr/');

  assert.deepEqual(result.emails, ['ventas@example.co.cr']);
  assert.deepEqual(result.phones, ['+506 2222 3333']);
  assert.deepEqual(result.contactLinks, ['https://example.co.cr/contacto']);
  assert.deepEqual(result.linkedinUrls, ['https://www.linkedin.com/in/jane-example/']);
});

test('normalizes public decision-makers without accepting arbitrary profile URLs', () => {
  const people = normalizeProspectPeople([{
    full_name: ' Jane Example ',
    job_title: 'Founder',
    email: 'JANE@EXAMPLE.COM',
    linkedin_url: 'https://linkedin.com/in/jane-example',
    source_url: 'https://example.com/team',
    verification_status: 'published_domain_valid',
    confidence: 91.6,
  }]);
  assert.equal(people[0].full_name, 'Jane Example');
  assert.equal(people[0].email, 'jane@example.com');
  assert.equal(people[0].confidence, 92);
  assert.deepEqual(normalizeLinkedInProfileUrls([
    'https://linkedin.com/in/jane-example',
    'https://example.com/not-linkedin',
  ]), ['https://linkedin.com/in/jane-example']);
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

test('manual input cannot supply its own fit score or reasons', () => {
  const result = normalizeProspectInput({
    organization_name: 'Unrelated Hardware Store',
    category: 'hardware',
    fit_score: 100,
    fit_reasons: ['Browser says perfect'],
  });

  assert.equal(result.fit_score, 5);
  assert.deepEqual(result.fit_reasons, []);
});

test('create input cannot assign an arbitrary pipeline owner', () => {
  const result = normalizeProspectInput({
    organization_name: 'Ownership bypass attempt',
    owner_email: 'someone-else@example.test',
  });
  assert.equal(result.owner_email, null);
});

test('a historic global opt-out remains a global channel opt-out on save', () => {
  const result = normalizeProspectInput({
    organization_name: 'Opted-out business',
    contact_permission_status: 'do_not_contact',
  });
  assert.equal(result.status, 'do_not_contact');
  assert.equal(result.contact_permission_status, 'do_not_contact');
  assert.equal(result.email_permission_status, 'do_not_contact');
  assert.equal(result.whatsapp_permission_status, 'do_not_contact');
});

test('leaves country unknown instead of assuming the storefront home country', () => {
  assert.equal(normalizeProspectInput({ organization_name: 'Tokyo Fitness', city: 'Tokyo' }).country, null);
  assert.equal(normalizeProspectInput({ organization_name: 'Berlin Gym', country: 'Germany' }).country, 'Germany');
});

test('re-saving a discovered business keeps the pipeline state it earned', () => {
  const existing = {
    id: 'uuid-1',
    source_provider: 'openstreetmap',
    source_external_id: 'node:42',
    organization_name: 'Gimnasio Central',
    category: 'fitness centre',
    status: 'qualified',
    notes: 'Owner asked for a callback in March.',
    owner_email: 'sales@peptides.test',
    next_follow_up_at: '2026-09-01T15:00:00.000Z',
    last_contacted_at: '2026-08-01T15:00:00.000Z',
    email: 'owner@gimnasio.test',
    phone: '+506 2222 2222',
    contact_permission_status: 'consented',
    email_permission_status: 'consented',
    email_permission_basis: 'express_consent',
    email_permission_evidence: 'Owner opted in during the July call.',
    email_permission_verified_at: '2026-07-01T15:00:00.000Z',
    people: [{ full_name: 'Ana Rojas', job_title: 'Owner' }],
    linkedin_urls: ['https://linkedin.com/in/ana-rojas'],
    country: 'Costa Rica',
  };
  const rediscovered = normalizeProspectInput({
    source_provider: 'openstreetmap',
    source_external_id: 'node:42',
    organization_name: 'Gimnasio Central CR',
    website_url: 'https://gimnasio.test',
    city: 'Escazú',
  });

  const merged = mergeRediscoveredProspect(existing, rediscovered);

  assert.equal(merged.status, 'qualified');
  assert.equal(merged.notes, 'Owner asked for a callback in March.');
  assert.equal(merged.owner_email, 'sales@peptides.test');
  assert.equal(merged.next_follow_up_at, '2026-09-01T15:00:00.000Z');
  assert.equal(merged.last_contacted_at, '2026-08-01T15:00:00.000Z');
  assert.equal(merged.contact_permission_status, 'consented');
  assert.equal(merged.email_permission_status, 'consented');
  assert.equal(merged.email_permission_evidence, 'Owner opted in during the July call.');
  assert.equal(merged.people.length, 1);
  assert.deepEqual(merged.linkedin_urls, ['https://linkedin.com/in/ana-rojas']);
  // Curated contacts survive; refreshed directory details land.
  assert.equal(merged.email, 'owner@gimnasio.test');
  assert.equal(merged.phone, '+506 2222 2222');
  assert.equal(merged.organization_name, 'Gimnasio Central CR');
  assert.equal(merged.website_url, 'https://gimnasio.test/');
  assert.equal(merged.city, 'Escazú');
});

test('contact permission only ever moves upward', () => {
  assert.equal(upgradeContactPermission('unknown', 'business_contact'), 'business_contact');
  assert.equal(upgradeContactPermission('consented', 'business_contact'), 'consented');
  assert.equal(upgradeContactPermission('do_not_contact', 'business_contact'), 'do_not_contact');
  assert.equal(upgradeContactPermission('business_contact', 'unknown'), 'business_contact');
  assert.equal(mergeRediscoveredProspect(
    { status: 'qualified', contact_permission_status: 'do_not_contact' },
    { contact_permission_status: 'business_contact' },
  ).status, 'do_not_contact');
});

test('rejects identifiers, order numbers and price ranges that look like phones', () => {
  const result = extractPublishedContacts(`
    <html><body>
      <p>Founded 2010. Tax ID 3101234567. Order #100200300400.</p>
      <p>Prices: 25000 - 45000 colones. Ref 2024 2025 1234567890</p>
      <p>Teléfono: 22223333</p>
      <p>Escríbenos: 8888 7777</p>
    </body></html>
  `, 'https://elitefitness.co.cr/');

  assert.deepEqual(result.phones, ['22223333', '88887777']);
  assert.deepEqual(result.linkedPhones, []);
});

test('ignores website-builder addresses and ranks the business inbox first', () => {
  const result = extractPublishedContacts(`
    <html><body>
      <a href="mailto:noreply@wixpress.com">system</a>
      <p>Reach us at noreply@elitefitness.co.cr or info@elitefitness.co.cr</p>
      <p>Agency contact: hello@some-agency.example</p>
    </body></html>
  `, 'https://www.elitefitness.co.cr/');

  assert.equal(result.emails[0], 'info@elitefitness.co.cr');
  assert.ok(!result.emails.includes('noreply@wixpress.com'));
  assert.ok(result.emails.indexOf('noreply@elitefitness.co.cr') > result.emails.indexOf('info@elitefitness.co.cr'));
  // Nothing was published as a real mailto:, so permission stays unproven.
  assert.deepEqual(result.linkedEmails, []);
});

test('collects click-to-chat numbers a business publishes on its own site', () => {
  const numbers = extractWhatsAppNumbers(`
    <a href="https://wa.me/50688887777">WhatsApp</a>
    <a href="https://api.whatsapp.com/send?phone=50622223333&text=Hola">Escríbenos</a>
    <a href="whatsapp://send?phone=%2B50644445555">App</a>
    <a href="https://chat.whatsapp.com/JoinMyGroupInvite">Community group</a>
    <a href="https://wa.me/message/VANITYCODE">Short link</a>
  `);
  // Group invites and vanity links carry no number, so they are skipped.
  assert.deepEqual(numbers, ['+50688887777', '+50622223333', '+50644445555']);
});

test('reads schema.org contact blocks that tag stripping used to discard', () => {
  const structured = extractStructuredContacts(`
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"HealthClub","name":"Escazu Fitness",
     "email":"mailto:Info@EscazuFitness.co.cr","telephone":"+506 2288 1234",
     "sameAs":["https://www.instagram.com/escazufitness"]}
    </script>
  `);
  assert.deepEqual(structured.emails, ['info@escazufitness.co.cr']);
  assert.deepEqual(structured.phones, ['+506 2288 1234']);
  assert.ok(structured.profiles.includes('https://www.instagram.com/escazufitness'));
});

test('recovers Cloudflare-obfuscated addresses the business published', () => {
  // Same address, XOR-encoded with key 0x7a as Cloudflare emits it.
  const email = 'info@escazufitness.co.cr';
  const key = 0x7a;
  const hex = key.toString(16).padStart(2, '0')
    + [...email].map((char) => (char.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');

  assert.equal(decodeCloudflareEmail(hex), email);
  assert.equal(decodeCloudflareEmail('not-hex'), null);

  // Cloudflare encodes the whole mailto target, so a real page yields a second
  // blob with a ?subject= tail whose spaces are still percent-escaped.
  const withSubject = `${email}?subject=i%20have%20a%20question`;
  const tailHex = key.toString(16).padStart(2, '0')
    + [...withSubject].map((char) => (char.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');
  assert.equal(decodeCloudflareEmail(tailHex), email, 'strips the mailto query tail');

  const page = extractPublishedContacts(
    `<a class="__cf_email__" data-cfemail="${hex}">[email&#160;protected]</a>`,
    'https://escazufitness.co.cr/',
  );
  assert.deepEqual(page.emails, [email]);
  assert.deepEqual(page.linkedEmails, [email]);
});

test('reads a whole published contact block the way a real site publishes it', () => {
  const result = extractPublishedContacts(`
    <html><body>
      <script type="application/ld+json">
      {"@type":"HealthClub","email":"info@escazufitness.co.cr","telephone":"+506 2288 1234"}
      </script>
      <a href="https://wa.me/50688887777">Escríbenos por WhatsApp</a>
      <a href="https://www.instagram.com/escazufitness/">Instagram</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
      <p>Escríbenos a ventas (at) escazufitness (dot) co.cr</p>
    </body></html>
  `, 'https://escazufitness.co.cr/');

  assert.ok(result.emails.includes('info@escazufitness.co.cr'));
  assert.ok(result.emails.includes('ventas@escazufitness.co.cr'), 'deobfuscates (at)/(dot)');
  assert.deepEqual(result.whatsappNumbers, ['+50688887777']);
  assert.ok(result.phones.includes('+50688887777'));
  assert.deepEqual(result.socialProfiles, ['https://www.instagram.com/escazufitness']);
  // Structured data counts as published, so permission is supported.
  assert.ok(result.linkedEmails.includes('info@escazufitness.co.cr'));
});

test('picks up WhatsApp and mobile tags mappers record in OpenStreetMap', () => {
  const result = normalizeOpenStreetMapPlace({
    osm_type: 'node',
    osm_id: 7,
    lat: 9.93,
    lon: -84.07,
    name: 'Clinica Bienestar',
    extratags: { 'contact:whatsapp': '+506 8888 7777', 'contact:mobile': '+506 8888 7777' },
  });
  assert.deepEqual(result.whatsapp_numbers, ['+50688887777']);
  assert.equal(result.phone, '+506 8888 7777');
  assert.equal(result.contact_permission_status, 'unknown');
  assert.equal(result.whatsapp_permission_status, 'unknown');
});

test('recognizes missing prospect table errors from Postgres and PostgREST', () => {
  assert.equal(isProspectsTableMissing({ code: '42P01' }), true);
  assert.equal(isProspectsTableMissing({ code: 'PGRST205' }), true);
  assert.equal(isProspectsTableMissing({ code: '42703', message: 'column contact_source_url does not exist' }), true);
  assert.equal(isProspectsTableMissing({ code: 'PGRST204', message: "Could not find the 'email_permission_status' column" }), true);
  assert.equal(isProspectsTableMissing({ message: "Could not find sales_prospects in the schema cache" }), true);
  assert.equal(isProspectsTableMissing({ code: '23505' }), false);
});

test('overpass falls back across mirrors, with any configured endpoint first', () => {
  const withConfig = overpassEndpoints('https://my-overpass.test/api/interpreter');
  assert.equal(withConfig[0], 'https://my-overpass.test/api/interpreter');
  assert.ok(withConfig.length > 1, 'configured endpoint still gets fallbacks behind it');

  const defaults = overpassEndpoints('');
  assert.equal(defaults[0], 'https://overpass-api.de/api/interpreter');
  assert.equal(new Set(defaults).size, defaults.length, 'no duplicate endpoints');
});

test('a configured endpoint that matches a built-in mirror is not tried twice', () => {
  const endpoints = overpassEndpoints('https://overpass.kumi.systems/api/interpreter');
  assert.equal(endpoints[0], 'https://overpass.kumi.systems/api/interpreter');
  assert.equal(endpoints.filter((url) => url.includes('kumi')).length, 1);
});

test('only endpoint-level failures are worth another mirror', () => {
  assert.equal(isRetryableOverpassStatus(429), true);
  assert.equal(isRetryableOverpassStatus(504), true);
  assert.equal(isRetryableOverpassStatus(503), true);
  assert.equal(isRetryableOverpassStatus(400), false);
  assert.equal(isRetryableOverpassStatus(200), false);
});

test('a degraded search is cached briefly so retrying actually retries', () => {
  assert.equal(searchCacheTtlMs([]), SEARCH_CACHE_TTL_MS);
  assert.equal(searchCacheTtlMs(['Category search is rate-limited…']), DEGRADED_SEARCH_CACHE_TTL_MS);
  assert.ok(DEGRADED_SEARCH_CACHE_TTL_MS < SEARCH_CACHE_TTL_MS);
});

test('anchored tag patterns become exact matches so country searches stay indexed', () => {
  assert.deepEqual(expandAnchoredTagPattern('^fitness_centre$'), ['fitness_centre']);
  assert.deepEqual(expandAnchoredTagPattern('^(fitness|bodybuilding|weightlifting)$'), ['fitness', 'bodybuilding', 'weightlifting']);
  assert.deepEqual(expandAnchoredTagPattern('^(dietitian|nutrition_counselling)$'), ['dietitian', 'nutrition_counselling']);
});

test('every shipped category profile takes the fast exact-match path', () => {
  for (const category of ['gym', 'wellness', 'nutritionist', 'sports clinic', 'aesthetic clinic', 'laboratory']) {
    for (const [key, pattern] of prospectSearchProfile(category).tagFilters) {
      assert.ok(
        expandAnchoredTagPattern(pattern),
        `${category} filter ${key}~${pattern} would fall back to a slow regex scan`,
      );
    }
  }
});

test('patterns that genuinely need regex are left alone', () => {
  assert.equal(expandAnchoredTagPattern('gym|fitness|health club'), null, 'unanchored');
  assert.equal(expandAnchoredTagPattern('^fitness.*$'), null, 'wildcard');
  assert.equal(expandAnchoredTagPattern('^(broken$'), null, 'mismatched parens');
  assert.equal(expandAnchoredTagPattern(''), null);
  assert.equal(expandAnchoredTagPattern(undefined), null);
});
