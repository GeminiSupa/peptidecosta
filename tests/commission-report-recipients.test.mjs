import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildCommissionAdminRecipients } from '../src/lib/commissionReportRecipients.mjs';

test('active superadmins receive every commission report and regular agents never do', () => {
  const recipients = buildCommissionAdminRecipients([
    { email: 'dani@example.com', is_superadmin: true, status: 'active' },
    { email: 'agent.one@example.com', is_superadmin: false, status: 'active' },
    { email: 'former.manager@example.com', is_superadmin: true, status: 'suspended' },
  ], 'info@peptidescostarica.net, agent.one@example.com, omerforce@gmail.com');

  assert.equal(recipients, 'info@peptidescostarica.net, dani@example.com');
});

test('superadmin recipients are deduplicated without changing their address casing', () => {
  const recipients = buildCommissionAdminRecipients([
    { email: 'Dani@Example.com', is_superadmin: true },
  ], 'dani@example.com, info@peptidescostarica.net');

  assert.equal(recipients, 'dani@example.com, info@peptidescostarica.net');
});

test('both weekly scan and approval use the role-filtered admin audience', () => {
  const scanRoute = fs.readFileSync('src/app/api/admin/commissions/weekly-report/route.js', 'utf8');
  const approvalRoute = fs.readFileSync('src/app/api/admin/commissions/approve/route.js', 'utf8');

  assert.match(scanRoute, /buildCommissionAdminRecipients\(profiles, ADMIN_CC_EMAILS\)/);
  assert.match(scanRoute, /to:\s*adminRecipients/);
  assert.match(approvalRoute, /select\('email, is_superadmin, status'\)/);
  assert.match(approvalRoute, /buildCommissionAdminRecipients\(adminProfiles \|\| \[\], ADMIN_CC_EMAILS\)/);
  assert.match(approvalRoute, /cc:\s*adminRecipients/);
});
