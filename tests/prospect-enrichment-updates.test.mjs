import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichmentUpdates } from '../src/lib/prospectEnrichmentRunner.mjs';

const scan = {
  email: 'ventas@farmacia.cr',
  phone: '+50622223333',
  sourceUrl: 'https://farmacia.cr/contacto',
  emailPermissionStatus: 'business_contact',
  emailPermissionSourceUrl: 'https://farmacia.cr/contacto',
  emailPermissionEvidence: 'Published email found during website scan',
};

test('a scan makes the prospect contactable in the same write', () => {
  // The send gate needs a status, a basis and the page the address was
  // published on. All three come out of the scan, so nothing has to be
  // unlocked by hand afterwards.
  const updates = enrichmentUpdates(scan, { email: null, email_permission_status: 'unknown' });
  assert.equal(updates.email, 'ventas@farmacia.cr');
  assert.equal(updates.email_permission_status, 'business_contact');
  assert.equal(updates.email_permission_basis, 'published_business_contact');
  assert.equal(updates.email_permission_source_url, 'https://farmacia.cr/contacto');
});

test('a scan that finds nothing never erases what a person entered', () => {
  const updates = enrichmentUpdates({}, {
    email: 'typed@byhand.cr',
    phone: '+50688887777',
    people: [{ full_name: 'Ana Rojas' }],
    linkedin_urls: ['https://linkedin.com/in/ana'],
    contact_source_url: 'https://farmacia.cr/nosotros',
  });
  assert.equal(updates.email, 'typed@byhand.cr');
  assert.equal(updates.phone, '+50688887777');
  assert.deepEqual(updates.people, [{ full_name: 'Ana Rojas' }]);
  assert.deepEqual(updates.linkedin_urls, ['https://linkedin.com/in/ana']);
  assert.equal(updates.contact_source_url, 'https://farmacia.cr/nosotros');
});

test('permission is only ever raised, never lowered by a rescan', () => {
  // Someone recorded express consent. A later crawl that only finds a
  // published address must not downgrade that to "business contact", and a
  // crawl that finds nothing must not drop it to unknown.
  const consented = { email_permission_status: 'consented', email_permission_basis: 'express_consent' };
  assert.equal(enrichmentUpdates(scan, consented).email_permission_status, 'consented');
  assert.equal(enrichmentUpdates({}, consented).email_permission_status, 'consented');
  // And a do-not-contact is never walked back.
  assert.equal(
    enrichmentUpdates(scan, { email_permission_status: 'do_not_contact' }).email_permission_status,
    'do_not_contact',
  );
});

test('an unchanged permission keeps the evidence already on the record', () => {
  const existing = {
    email_permission_status: 'business_contact',
    email_permission_basis: 'published_business_contact',
    email_permission_source_url: 'https://farmacia.cr/original',
    email_permission_evidence: 'Recorded earlier',
  };
  const updates = enrichmentUpdates(scan, existing);
  assert.equal(updates.email_permission_source_url, 'https://farmacia.cr/original');
  assert.equal(updates.email_permission_evidence, 'Recorded earlier');
});

test('every scan stamps when it happened', () => {
  // enriched_at is what stops the worker queueing the same prospect forever.
  const updates = enrichmentUpdates({}, {});
  assert.ok(Date.parse(updates.enriched_at) > 0);
});
