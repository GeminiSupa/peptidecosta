import test from 'node:test';
import assert from 'node:assert/strict';

import { canSafelyRestoreProduct, canSafelyRestoreLegacyProduct } from '../src/lib/dealOfWeek.mjs';
import { dealFieldsMatch } from '../src/lib/dealProductProtection.mjs';

// The exact values read from the live database on 2026-08-30, for the deal that
// was showing "Needs attention" and would have refused to restore on expiry.
const CURRENT = {
  price_usd: '$127.50',
  price_crc: '₡57,198',
  original_price_usd: '$150',
  original_price_crc: '₡67,292',
  discount: '15% Deal of the Week',
  sale_start_time: '2026-08-25T01:48:05.617+00:00',
  sale_end_time: '2026-08-31T05:59:59.999+00:00',
};

const APPLIED = {
  ...CURRENT,
  price_crc: '₡57,513',
  original_price_crc: '₡67,663',
  sale_start_time: '2026-08-25T01:48:05.617Z',
  sale_end_time: '2026-08-31T05:59:59.999Z',
};

test('a timestamp is the same instant whether Postgres or JSON wrote it', () => {
  // Postgres returns +00:00, a serialized Date writes Z. Compared as strings
  // these differ for every deal ever launched, from the moment the snapshot is
  // taken — which made the restore refuse and the health card cry wolf.
  assert.equal(
    dealFieldsMatch(
      { sale_end_time: '2026-08-31T05:59:59.999+00:00' },
      { sale_end_time: '2026-08-31T05:59:59.999Z' },
      ['sale_end_time'],
    ),
    true,
  );
});

test('a moved exchange rate is not a manual edit', () => {
  assert.equal(
    dealFieldsMatch({ price_crc: '₡57,198' }, { price_crc: '₡57,513' }),
    true,
    'CRC is re-derived from the live rate and must not count as an edit',
  );
});

test('the live deal restores safely', () => {
  assert.equal(canSafelyRestoreProduct(CURRENT, APPLIED), true);
});

test('a real manual edit is still refused', () => {
  for (const [field, value] of [
    ['price_usd', '$99.00'],
    ['original_price_usd', '$180'],
    ['discount', 'Clearance'],
    ['sale_end_time', '2026-09-05T05:59:59.999+00:00'],
  ]) {
    assert.equal(
      canSafelyRestoreProduct({ ...CURRENT, [field]: value }, APPLIED),
      false,
      `${field} changed by hand should block the restore`,
    );
  }
});

test('a deal with no snapshot restores rather than stalling', () => {
  assert.equal(canSafelyRestoreProduct(CURRENT, null), true);
  assert.equal(canSafelyRestoreProduct(CURRENT, {}), true);
});

test('a legacy deal compares its timestamps by instant too', () => {
  const deal = {
    discount_pct: 0.15,
    starts_at: '2026-08-25T01:48:05.617Z',
    ends_at: '2026-08-31T05:59:59.999Z',
  };
  const current = {
    price_usd: '$127.50',
    original_price_usd: '$150',
    discount: '15% Deal of the Week',
    sale_start_time: '2026-08-25T01:48:05.617+00:00',
    sale_end_time: '2026-08-31T05:59:59.999+00:00',
  };
  assert.equal(canSafelyRestoreLegacyProduct(current, { price_usd: '$150' }, deal), true);
  assert.equal(
    canSafelyRestoreLegacyProduct({ ...current, price_usd: '$99.00' }, { price_usd: '$150' }, deal),
    false,
  );
});
