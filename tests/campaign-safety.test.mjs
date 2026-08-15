import test from 'node:test';
import assert from 'node:assert/strict';

import { getCampaignSafetyConfig } from '../src/lib/campaignSafety.mjs';

test('campaigns default to reputation-recovery pacing', () => {
  assert.deepEqual(getCampaignSafetyConfig({}), {
    batchSize: 50,
    batchIntervalMinutes: 30,
    sendDelayMs: 1500,
    fallbackSendDelayMs: 2500,
    maxConnections: 1,
    sendBudgetMs: 240000,
  });
});

test('campaign pacing remains controllable through server environment settings', () => {
  const config = getCampaignSafetyConfig({
    EMAIL_CAMPAIGN_BATCH_SIZE: '25',
    EMAIL_CAMPAIGN_BATCH_INTERVAL_MINUTES: '60',
    EMAIL_CAMPAIGN_SEND_DELAY_MS: '2000',
    EMAIL_CAMPAIGN_FALLBACK_SEND_DELAY_MS: '3000',
    EMAIL_CAMPAIGN_SMTP_CONNECTIONS: '1',
    EMAIL_CAMPAIGN_SEND_BUDGET_MS: '180000',
  });

  assert.deepEqual(config, {
    batchSize: 25,
    batchIntervalMinutes: 60,
    sendDelayMs: 2000,
    fallbackSendDelayMs: 3000,
    maxConnections: 1,
    sendBudgetMs: 180000,
  });
});

test('invalid pacing values fall back to safe defaults', () => {
  const config = getCampaignSafetyConfig({
    EMAIL_CAMPAIGN_BATCH_SIZE: '0',
    EMAIL_CAMPAIGN_BATCH_INTERVAL_MINUTES: '-1',
    EMAIL_CAMPAIGN_SEND_DELAY_MS: 'invalid',
    EMAIL_CAMPAIGN_SMTP_CONNECTIONS: '0',
  });

  assert.equal(config.batchSize, 50);
  assert.equal(config.batchIntervalMinutes, 30);
  assert.equal(config.sendDelayMs, 1500);
  assert.equal(config.maxConnections, 1);
});
