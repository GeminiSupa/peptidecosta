import test from 'node:test';
import assert from 'node:assert/strict';

const SMTP_KEYS = [
  'ORDER_SMTP_HOST',
  'ORDER_SMTP_PORT',
  'ORDER_SMTP_SECURE',
  'ORDER_SMTP_USER',
  'ORDER_SMTP_PASS',
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

const originalEnv = Object.fromEntries(SMTP_KEYS.map((key) => [key, process.env[key]]));

function clearEnv() {
  for (const key of SMTP_KEYS) delete process.env[key];
}

function restoreEnv() {
  for (const key of SMTP_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

test.after(restoreEnv);

test('transactional SMTP ignores generic Rackspace settings', async () => {
  clearEnv();
  process.env.SMTP_HOST = 'secure.emailsrvr.com';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_SECURE = 'true';
  process.env.SMTP_USER = 'mailbox@example.com';
  process.env.SMTP_PASS = 'legacy-secret';

  const { getTransactionalSmtpConfig } = await import('../src/lib/transactionalSmtp.js');
  const config = getTransactionalSmtpConfig();

  assert.equal(config.configured, false);
  assert.equal(config.host, undefined);
  assert.equal(config.user, undefined);
  assert.equal(config.pass, undefined);
});

test('transactional SMTP refuses to reuse Elastic campaign credentials', async () => {
  clearEnv();
  process.env.CAMPAIGN_SMTP_HOST = 'smtp.elasticemail.com';
  process.env.CAMPAIGN_SMTP_PORT = '2525';
  process.env.CAMPAIGN_SMTP_SECURE = 'true';
  process.env.CAMPAIGN_SMTP_USER = 'elastic-user';
  process.env.CAMPAIGN_SMTP_PASS = 'elastic-secret';

  const { getTransactionalSmtpConfig } = await import('../src/lib/transactionalSmtp.js');
  const config = getTransactionalSmtpConfig();

  assert.equal(config.configured, false);
  assert.equal(config.host, undefined);
  assert.equal(config.user, undefined);
  assert.equal(config.isolated, false);
});

test('a dedicated Elastic order identity is configured with STARTTLS', async () => {
  clearEnv();
  process.env.ORDER_SMTP_HOST = 'smtp.elasticemail.com';
  process.env.ORDER_SMTP_PORT = '2525';
  process.env.ORDER_SMTP_SECURE = 'true';
  process.env.ORDER_SMTP_USER = 'transactional-user';
  process.env.ORDER_SMTP_PASS = 'transactional-secret';
  process.env.CAMPAIGN_SMTP_USER = 'marketing-user';

  const { getTransactionalSmtpConfig } = await import('../src/lib/transactionalSmtp.js');
  const config = getTransactionalSmtpConfig();

  assert.equal(config.configured, true);
  assert.equal(config.host, 'smtp.elasticemail.com');
  assert.equal(config.port, 2525);
  assert.equal(config.secure, false);
  assert.equal(config.user, 'transactional-user');
  assert.equal(config.isolated, true);
  assert.equal(config.sharesCampaignIdentity, false);
  assert.equal(config.provider, 'Elastic Email');
});

test('an order configuration sharing the campaign identity is rejected', async () => {
  clearEnv();
  process.env.ORDER_SMTP_HOST = 'smtp.elasticemail.com';
  process.env.ORDER_SMTP_USER = 'same-user';
  process.env.ORDER_SMTP_PASS = 'order-secret';
  process.env.CAMPAIGN_SMTP_USER = 'SAME-USER';

  const { getTransactionalSmtpConfig } = await import('../src/lib/transactionalSmtp.js');
  const config = getTransactionalSmtpConfig();

  assert.equal(config.configured, false);
  assert.equal(config.isolated, false);
  assert.equal(config.sharesCampaignIdentity, true);
});

test('a dedicated Rackspace order host is rejected', async () => {
  clearEnv();
  process.env.ORDER_SMTP_HOST = 'secure.emailsrvr.com';
  process.env.ORDER_SMTP_USER = 'mailbox@example.com';
  process.env.ORDER_SMTP_PASS = 'legacy-secret';

  const { getTransactionalSmtpConfig } = await import('../src/lib/transactionalSmtp.js');
  const config = getTransactionalSmtpConfig();

  assert.equal(config.configured, false);
  assert.equal(config.provider, null);
});
