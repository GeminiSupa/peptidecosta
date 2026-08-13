import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  getOrderEmailLogoAttachment,
  ORDER_EMAIL_LOGO_CID,
  ORDER_EMAIL_LOGO_SRC,
  ORDER_EMAIL_LOGO_URL,
} from '../src/lib/orderEmailBranding.mjs';

test('order emails embed the live logo instead of relying on remote image loading', () => {
  const attachment = getOrderEmailLogoAttachment();

  assert.equal(ORDER_EMAIL_LOGO_SRC, `cid:${ORDER_EMAIL_LOGO_CID}`);
  assert.equal(attachment.path, ORDER_EMAIL_LOGO_URL);
  assert.equal(attachment.cid, ORDER_EMAIL_LOGO_CID);
  assert.equal(attachment.contentDisposition, 'inline');
});

test('both order messages attach the embedded logo and retain a text brand fallback', () => {
  const route = fs.readFileSync('src/app/api/order-notification/route.js', 'utf8');

  assert.equal((route.match(/attachments: \[getOrderEmailLogoAttachment\(\)\]/g) || []).length, 2);
  assert.equal((route.match(/PEPTIDES COSTA RICA<\/div>/g) || []).length, 2);
  assert.doesNotMatch(route, /<img src="https:\/\/catalog\.peptidescostarica\.net\/logo\.png/);
});
