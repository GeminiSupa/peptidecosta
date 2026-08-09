import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_TIKTOK_PIXEL_ID,
  MAIN_SITE_TIKTOK_PIXEL_ID,
  getTikTokPixelBootstrapScript,
  getTikTokPixelId,
} from '../src/lib/tiktokPixel.mjs';

test('each production hostname receives only its assigned TikTok pixel', () => {
  assert.equal(getTikTokPixelId('peptidescostarica.net'), MAIN_SITE_TIKTOK_PIXEL_ID);
  assert.equal(getTikTokPixelId('www.peptidescostarica.net'), MAIN_SITE_TIKTOK_PIXEL_ID);
  assert.equal(getTikTokPixelId('catalog.peptidescostarica.net'), CATALOG_TIKTOK_PIXEL_ID);
});

test('previews and local development do not send TikTok pixel traffic', () => {
  assert.equal(getTikTokPixelId('localhost'), '');
  assert.equal(getTikTokPixelId('peptidecosta.vercel.app'), '');
  assert.equal(getTikTokPixelId(''), '');
});

test('the bootstrap loads TikTok once using the hostname-selected pixel', () => {
  const script = getTikTokPixelBootstrapScript();

  assert.match(script, /analytics\.tiktok\.com\/i18n\/pixel\/events\.js/);
  assert.match(script, /ttq\.load\(pixelId\)/);
  assert.equal((script.match(/ttq\.page\(\)/g) || []).length, 1);
  assert.equal((script.match(new RegExp(MAIN_SITE_TIKTOK_PIXEL_ID, 'g')) || []).length, 2);
  assert.equal((script.match(new RegExp(CATALOG_TIKTOK_PIXEL_ID, 'g')) || []).length, 1);
});
