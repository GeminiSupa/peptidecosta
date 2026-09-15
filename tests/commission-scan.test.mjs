import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  hasPositivePayout,
  payoutMatchesPeriod,
  summarizeCommissionScan,
} from '../src/lib/commissionScan.mjs';

test('configured commission rates do not turn no-work weeks into zero-dollar payouts', () => {
  assert.equal(hasPositivePayout({ totalPayoutUsd: 0, totalPayoutCrc: 0 }), false);
  assert.equal(hasPositivePayout({ totalPayoutUsd: 0.01, totalPayoutCrc: 0 }), true);
  assert.equal(hasPositivePayout({ totalPayoutUsd: 0, totalPayoutCrc: 1 }), true);
});

test('the payout screen can stay on the exact period that was scanned', () => {
  const period = {
    start: '2026-08-10T06:00:00.000Z',
    end: '2026-08-17T05:59:59.999Z',
  };

  assert.equal(payoutMatchesPeriod({
    start_date: '2026-08-10T06:00:00+00:00',
    end_date: '2026-08-17T05:59:59.999+00:00',
  }, period), true);
  assert.equal(payoutMatchesPeriod({
    start_date: '2026-08-03T06:00:00.000Z',
    end_date: '2026-08-10T05:59:59.999Z',
  }, period), false);
  assert.equal(payoutMatchesPeriod({}, null), true);
});

test('scan summaries separate approved accounting resends from pending work', () => {
  assert.deepEqual(summarizeCommissionScan([
    { alreadySettled: true, accountingCopy: { sent: true } },
    { alreadySettled: true, accountingCopy: { sent: false, error: 'mailbox rejected' } },
    { alreadySettled: false, accountingCopy: { sent: false, skipped: 'not-approved' } },
  ], [{ email: 'zero@example.com' }]), {
    reports: 3,
    approved: 2,
    pending: 1,
    accountingSent: 1,
    accountingFailed: 1,
    skippedNoPay: 1,
    cleanupFailed: 0,
  });
});

test('an approved weekly rerun sends a dedicated accounting copy', () => {
  const route = fs.readFileSync('src/app/api/admin/commissions/weekly-report/route.js', 'utf8');
  assert.match(route, /settledPayout\s*\?\s*await sendTaxRecordsPayoutCopy\(/);
  assert.match(route, /accountingCopy,/);
  assert.match(route, /skippedNoPay/);
});

test('a commission scan never emails an agent before approval', () => {
  const scanRoute = fs.readFileSync('src/app/api/admin/commissions/weekly-report/route.js', 'utf8');
  const approvalRoute = fs.readFileSync('src/app/api/admin/commissions/approve/route.js', 'utf8');

  // The scan stores a pending report and may notify admins, but employees do
  // not receive that unapproved draft. Approval is the sole employee send.
  assert.doesNotMatch(scanRoute, /to:\s*agent\.email/);
  assert.doesNotMatch(scanRoute, /subject:\s*`Your weekly pay report/);
  assert.match(approvalRoute, /requireSuperadmin:\s*true/);
  assert.match(approvalRoute, /to:\s*payout\.agent_email\.trim\(\)/);
});
