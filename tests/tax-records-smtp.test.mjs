import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTaxRecordsSmtpConfig,
  isRackspaceMailHost,
  resolveTaxRecordsMailer,
  taxRecordsFallbackFrom,
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

test('Elastic remains primary while Rackspace is prepared only as fallback', async () => {
  const fallbackTransporter = { sendMail: async () => ({ messageId: 'elastic' }) };
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

  assert.equal((await rackspace.transporter.sendMail({})).messageId, 'elastic');
  assert.equal(rackspace.source, 'transactional-external-identity-with-rackspace-local-mailbox-fallback');
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].auth, {
    user: 'info@peptidescostarica.net',
    pass: 'secret',
  });

  const fallback = resolveTaxRecordsMailer({
    fallbackTransporter,
    fallbackFrom: 'Shop <info@peptidescostarica.net>',
    env: {},
    createTransport: () => assert.fail('must not create an unconfigured transport'),
  });

  assert.equal(fallback.transporter, fallbackTransporter);
  assert.equal(fallback.from, 'Shop <info@peptidescostarica.net>');
  assert.equal(fallback.source, 'transactional-fallback');
});

test('Elastic fallback uses its external authenticated identity, never a spoofed Gmail address', () => {
  assert.equal(
    taxRecordsFallbackFrom({
      env: {},
      fallbackFrom: 'Shop <info@peptidescostarica.net>',
      fallbackUser: 'transactional@managedcloudhostingemail.com',
    }),
    'Peptides Costa Rica Records <transactional@managedcloudhostingemail.com>',
  );
  assert.equal(
    taxRecordsFallbackFrom({
      env: {},
      fallbackFrom: 'Shop <info@peptidescostarica.net>',
      fallbackUser: 'info@peptidescostarica.net',
    }),
    'Shop <info@peptidescostarica.net>',
  );
  assert.equal(
    taxRecordsFallbackFrom({
      env: { TAX_RECORDS_FROM: 'Records <verified@another-business-domain.test>' },
      fallbackFrom: 'Shop <info@peptidescostarica.net>',
      fallbackUser: 'transactional@managedcloudhostingemail.com',
    }),
    'Records <verified@another-business-domain.test>',
  );
});

test('an Elastic submission failure retries once through Rackspace', async () => {
  const rackspaceMessages = [];
  const resolved = resolveTaxRecordsMailer({
    fallbackTransporter: {
      sendMail: async () => { throw new Error('421 Elastic temporarily unavailable'); },
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
      sendMail: async (message) => {
        rackspaceMessages.push(message);
        return { messageId: 'rackspace-retry' };
      },
    }),
  });

  const result = await resolved.transporter.sendMail({
    from: resolved.from,
    to: 'pbagcr@peptidescostarica.net',
  });

  assert.equal(result.messageId, 'rackspace-retry');
  assert.equal(rackspaceMessages.length, 1);
  assert.equal(
    rackspaceMessages[0].from,
    'Peptides Costa Rica Records <info@peptidescostarica.net>',
  );
});
