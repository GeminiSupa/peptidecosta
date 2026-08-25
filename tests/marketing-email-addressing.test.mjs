import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterMarketingCopyRecipients,
  marketingCopyHeader,
} from '../src/lib/marketingEmailAddressing.mjs';

test('removes the excluded owner address from marketing copy recipients', () => {
  assert.equal(
    filterMarketingCopyRecipients('info@peptidescostarica.net, omerforce@gmail.com'),
    'info@peptidescostarica.net',
  );
  assert.equal(
    filterMarketingCopyRecipients('Omer <OMERFORCE@GMAIL.COM>'),
    undefined,
  );
});

test('omits empty copy headers and preserves allowed recipients', () => {
  assert.deepEqual(marketingCopyHeader('bcc', 'omerforce@gmail.com'), {});
  assert.deepEqual(
    marketingCopyHeader('cc', ['ops@example.com', 'sales@example.com']),
    { cc: 'ops@example.com, sales@example.com' },
  );
});
