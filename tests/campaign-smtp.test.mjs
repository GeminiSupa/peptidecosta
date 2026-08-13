import test from 'node:test';
import assert from 'node:assert/strict';

const CAMPAIGN_KEYS = [
  'CAMPAIGN_SMTP_HOST',
  'CAMPAIGN_SMTP_PORT',
  'CAMPAIGN_SMTP_SECURE',
  'CAMPAIGN_SMTP_USER',
  'CAMPAIGN_SMTP_PASS',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
];

const originalEnv = Object.fromEntries(CAMPAIGN_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of CAMPAIGN_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

test.after(restoreEnv);

test('campaign SMTP never inherits the generic Rackspace mailbox', async () => {
  for (const key of CAMPAIGN_KEYS) delete process.env[key];
  process.env.SMTP_HOST = 'secure.emailsrvr.com';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_SECURE = 'true';
  process.env.SMTP_USER = 'mailbox@example.com';
  process.env.SMTP_PASS = 'legacy-secret';

  const { getCampaignSmtpConfig } = await import('../src/lib/campaignSmtp.js');
  const config = getCampaignSmtpConfig();

  assert.equal(config.configured, false);
  assert.equal(config.host, undefined);
  assert.equal(config.user, undefined);
  assert.equal(config.pass, undefined);
});

test('Elastic Email on port 2525 is forced to STARTTLS mode', async () => {
  process.env.CAMPAIGN_SMTP_HOST = 'smtp.elasticemail.com';
  process.env.CAMPAIGN_SMTP_PORT = '2525';
  process.env.CAMPAIGN_SMTP_SECURE = 'true';
  process.env.CAMPAIGN_SMTP_USER = 'elastic-user';
  process.env.CAMPAIGN_SMTP_PASS = 'elastic-secret';

  const { getCampaignSmtpConfig, isElasticCampaignSmtp } = await import('../src/lib/campaignSmtp.js');
  const config = getCampaignSmtpConfig();

  assert.equal(config.configured, true);
  assert.equal(config.secure, false);
  assert.equal(isElasticCampaignSmtp(config), true);
});

test('a dedicated Rackspace campaign host is rejected as non-Elastic', async () => {
  process.env.CAMPAIGN_SMTP_HOST = 'secure.emailsrvr.com';

  const { getCampaignSmtpConfig, isElasticCampaignSmtp } = await import('../src/lib/campaignSmtp.js');
  assert.equal(isElasticCampaignSmtp(getCampaignSmtpConfig()), false);
});
