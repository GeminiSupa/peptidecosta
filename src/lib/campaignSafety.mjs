export const DEFAULT_CAMPAIGN_SAFETY = Object.freeze({
  batchSize: 50,
  batchIntervalMinutes: 30,
  sendDelayMs: 1500,
  fallbackSendDelayMs: 2500,
  maxConnections: 1,
  sendBudgetMs: 240000,
});

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// These server-only environment controls make campaign pacing adjustable
// without a deploy. The defaults intentionally favor mailbox reputation over
// throughput while Hotmail/iCloud reputation recovers.
export function getCampaignSafetyConfig(env = process.env) {
  return {
    batchSize: positiveInteger(
      env.EMAIL_CAMPAIGN_BATCH_SIZE || env.EMAIL_CAMPAIGN_MAX_RECIPIENTS_PER_SEND,
      DEFAULT_CAMPAIGN_SAFETY.batchSize,
    ),
    batchIntervalMinutes: nonNegativeInteger(
      env.EMAIL_CAMPAIGN_BATCH_INTERVAL_MINUTES,
      DEFAULT_CAMPAIGN_SAFETY.batchIntervalMinutes,
    ),
    sendDelayMs: nonNegativeInteger(
      env.EMAIL_CAMPAIGN_SEND_DELAY_MS,
      DEFAULT_CAMPAIGN_SAFETY.sendDelayMs,
    ),
    fallbackSendDelayMs: nonNegativeInteger(
      env.EMAIL_CAMPAIGN_FALLBACK_SEND_DELAY_MS,
      DEFAULT_CAMPAIGN_SAFETY.fallbackSendDelayMs,
    ),
    maxConnections: positiveInteger(
      env.EMAIL_CAMPAIGN_SMTP_CONNECTIONS,
      DEFAULT_CAMPAIGN_SAFETY.maxConnections,
    ),
    // Vercel kills the function at `maxDuration` (300s). Stop before that
    // wall and let the next scheduled batch continue the campaign.
    sendBudgetMs: positiveInteger(
      env.EMAIL_CAMPAIGN_SEND_BUDGET_MS,
      DEFAULT_CAMPAIGN_SAFETY.sendBudgetMs,
    ),
  };
}
