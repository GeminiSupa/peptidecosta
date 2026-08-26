import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTaxRecordsSmtpConfig,
  isRackspaceMailHost,
  resolveTaxRecordsMailer,
} from '../src/lib/taxRecordsSmtp.mjs';

test('recognises Rackspace hosts without accepting lookalike domains', () => {
  assert.equal(isRackspaceMailHost('secure.emailsrvr.com'), true);
  assert.equal(isRackspaceMailHost('mx1.emailsrvr.com'), true);
  assert.equal(isRackspaceMailHost('emailsrvr.com.example.net'), false);
  assert.equal(isRackspaceMailHost('smtp.elasticemail.com'), false);
});

test('uses the existing Rackspace mailbox only for accounting', () => {
  const config = getTaxRecordsSmtpConfig({
    SMTP_HOST: ' secure.emailsrvr.com ',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'info@peptidescostarica.net',
    SMTP_PASS: 'secret',
  });

  assert.equal(config.configured, true);
  assert.equal(config.source, 'rackspace-local-mailbox');
  assert.equal(config.provider, 'Rackspace');
  assert.equal(config.secure, true);
  assert.equal(config.from, 'Peptides Costa Rica Records <info@peptidescostarica.net>');
});

test('never inherits a generic non-Rackspace SMTP account', () => {
  const config = getTaxRecordsSmtpConfig({
    SMTP_HOST: 'smtp.elasticemail.com',
    SMTP_USER: 'campaign@example.net',
    SMTP_PASS: 'secret',
  });

  assert.equal(config.configured, false);
  assert.equal(config.host, '');
  assert.equal(config.source, 'transactional-fallback');
});

test('an explicit accounting transport wins over the legacy mailbox', () => {
  const config = getTaxRecordsSmtpConfig({
    TAX_RECORDS_SMTP_HOST: 'smtp.records.example.net',
    TAX_RECORDS_SMTP_PORT: '587',
    TAX_RECORDS_SMTP_SECURE: 'true',
    TAX_RECORDS_SMTP_USER: 'records@example.net',
    TAX_RECORDS_SMTP_PASS: 'dedicated-secret',
    TAX_RECORDS_SMTP_FROM: 'Records Desk <records@example.net>',
    SMTP_HOST: 'secure.emailsrvr.com',
    SMTP_USER: 'info@peptidescostarica.net',
    SMTP_PASS: 'legacy-secret',
  });

  assert.equal(config.configured, true);
  assert.equal(config.source, 'dedicated-accounting-smtp');
  assert.equal(config.host, 'smtp.records.example.net');
  assert.equal(config.port, 587);
  // STARTTLS ports must not be passed to Nodemailer as implicit TLS.
  assert.equal(config.secure, false);
  assert.equal(config.from, 'Records Desk <records@example.net>');
});

test('Rackspace is primary whenever an accounting mailbox is configured', async () => {
  let elasticCalls = 0;
  const fallbackTransporter = {
    sendMail: async () => {
      elasticCalls += 1;
      return { messageId: 'elastic' };
    },
  };
  const created = [];
  const rackspace = resolveTaxRecordsMailer({
    fallbackTransporter,
    fallbackFrom: 'Shop <info@peptidescostarica.net>',
    env: {
      SMTP_HOST: 'secure.emailsrvr.com',
      SMTP_PORT: '465',
      SMTP_USER: 'info@peptidescostarica.net',
      SMTP_PASS: 'secret',
    },
    createTransport: (config) => {
      created.push(config);
      return { sendMail: async () => ({ messageId: 'rackspace' }) };
    },
  });

  assert.equal((await rackspace.transporter.sendMail({})).messageId, 'rackspace');
  assert.equal(elasticCalls, 0);
  assert.equal(rackspace.from, 'Peptides Costa Rica Records <info@peptidescostarica.net>');
  assert.equal(rackspace.source, 'rackspace-local-mailbox');
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].auth, {
    user: 'info@peptidescostarica.net',
    pass: 'secret',
  });

  const unconfigured = resolveTaxRecordsMailer({
    fallbackTransporter,
    fallbackFrom: 'Shop <info@peptidescostarica.net>',
    env: {},
    createTransport: () => assert.fail('must not create an unconfigured transport'),
  });

  assert.equal(unconfigured.transporter, null);
  assert.equal(unconfigured.from, '');
  assert.equal(unconfigured.source, 'unconfigured');
  assert.equal(unconfigured.configured, false);
});

test('an accounting SMTP failure is surfaced and never hidden by Elastic', async () => {
  let elasticCalls = 0;
  const resolved = resolveTaxRecordsMailer({
    fallbackTransporter: {
      sendMail: async () => {
        elasticCalls += 1;
        return { messageId: 'elastic-accepted' };
      },
    },
    fallbackFrom: 'Shop <info@peptidescostarica.net>',
    fallbackUser: 'transactional@managedcloudhostingemail.com',
    env: {
      SMTP_HOST: 'secure.emailsrvr.com',
      SMTP_PORT: '465',
      SMTP_USER: 'info@peptidescostarica.net',
      SMTP_PASS: 'stale-secret',
    },
    createTransport: () => ({
      sendMail: async () => { throw new Error('535 Rackspace authentication failed'); },
    }),
  });

  await assert.rejects(
    resolved.transporter.sendMail({
      from: resolved.from,
      to: 'pbagcr@peptidescostarica.net',
    }),
    /Rackspace authentication failed/,
  );
  assert.equal(elasticCalls, 0);
});
