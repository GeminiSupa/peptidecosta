import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildShopperApprovedRecord,
  shopperApprovedConfig,
  shopperApprovedScriptUrl,
  shopperApprovedValues,
} from '../src/lib/shopperApproved.mjs';

const env = {
  SHOPPER_APPROVED_SITE_ID: '29967',
  SHOPPER_APPROVED_SURVEY_TOKEN: '90cSXD5t',
  SHOPPER_APPROVED_API_TOKEN: 'this-must-never-be-used',
};

test('a missing or malformed setting means no survey', () => {
  assert.equal(shopperApprovedConfig({}), null);
  assert.equal(shopperApprovedConfig({ SHOPPER_APPROVED_SITE_ID: '29967' }), null);
  assert.equal(shopperApprovedConfig({ SHOPPER_APPROVED_SURVEY_TOKEN: '90cSXD5t' }), null);
  assert.equal(shopperApprovedConfig({ ...env, SHOPPER_APPROVED_SITE_ID: 'not-a-number' }), null);
  assert.equal(shopperApprovedConfig({ ...env, SHOPPER_APPROVED_SURVEY_TOKEN: 'has space' }), null);
  assert.equal(shopperApprovedConfig({ ...env, SHOPPER_APPROVED_SURVEY_TOKEN: '<script>' }), null);
});

test('the API token is never part of the survey config', () => {
  const config = shopperApprovedConfig(env);
  assert.deepEqual(config, { siteId: '29967', token: '90cSXD5t' });
  assert.equal(JSON.stringify(config).includes('this-must-never-be-used'), false);
});

test('checkout records the order without putting the email in a URL', () => {
  const record = buildShopperApprovedRecord({
    orderId: ' PCR-10428 ',
    email: ' Ana@Example.com ',
    name: ' Ana Solis ',
  });
  assert.deepEqual(record, {
    orderId: 'PCR-10428',
    email: 'ana@example.com',
    name: 'Ana Solis',
  });
});

test('a real order becomes the values their script reads', () => {
  const values = shopperApprovedValues({
    siteId: env.SHOPPER_APPROVED_SITE_ID,
    token: env.SHOPPER_APPROVED_SURVEY_TOKEN,
    record: buildShopperApprovedRecord({
      orderId: 'PCR-10428',
      email: 'ana@example.com',
      name: 'Ana Solis',
    }),
  });
  assert.deepEqual(values, {
    site: 29967,
    token: '90cSXD5t',
    orderid: 'PCR-10428',
    email: 'ana@example.com',
    name: 'Ana Solis',
  });
  assert.equal(
    shopperApprovedScriptUrl(values.site),
    'https://www.shopperapproved.com/thankyou/rate/29967.js',
  );
});

test('a thank-you page opened with no purchase is not asked', () => {
  const args = {
    siteId: env.SHOPPER_APPROVED_SITE_ID,
    token: env.SHOPPER_APPROVED_SURVEY_TOKEN,
  };
  assert.equal(shopperApprovedValues({ ...args, record: { orderId: '', email: 'a@b.com' } }), null);
  assert.equal(shopperApprovedValues({ ...args, record: { orderId: 'PCR-1', email: 'nope' } }), null);
  assert.equal(shopperApprovedValues({ ...args, record: {} }), null);
  assert.equal(shopperApprovedScriptUrl('29967/evil'), null);
});

test('the survey token is not written into the source', async () => {
  const layout = await readFile(new URL('../src/app/thank-you/layout.js', import.meta.url), 'utf8');
  const survey = await readFile(new URL('../src/components/ShopperApprovedSurvey.js', import.meta.url), 'utf8');
  assert.match(layout, /shopperApprovedConfig\(\)/);
  assert.doesNotMatch(layout, /NEXT_PUBLIC_SHOPPER_APPROVED/);
  assert.doesNotMatch(survey, /process\.env/);
  assert.doesNotMatch(survey, /SHOPPER_APPROVED_API_TOKEN/);
  assert.doesNotMatch(`${layout}\n${survey}`, /90cSXD5t|29967/);
});
