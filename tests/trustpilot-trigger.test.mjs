import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveTrustpilotTriggerMailer,
  sendTrustpilotTrigger,
  trustpilotTriggerHtml,
} from '../src/lib/trustpilotTrigger.mjs';

const AFS = 'peptidescostarica.net+7777886f21@invite.trustpilot.com';

test('the standalone trigger contains AFS data but no customer receipt details', () => {
  const html = trustpilotTriggerHtml({
    recipientEmail: 'buyer@example.com',
    recipientName: 'Ana',
    referenceId: 'WPCR-123',
    locale: 'es-ES',
  });
  assert.match(html, /application\/json\+trustpilot/);
  assert.match(html, /buyer@example\.com/);
  assert.match(html, /WPCR-123/);
  assert.doesNotMatch(html, /shipping address|products|total paid/i);
});

test('the trigger transport uses the existing Rackspace mailbox', () => {
  let captured = null;
  const transporter = { sendMail: async () => ({}) };
  const mailer = resolveTrustpilotTriggerMailer({
    env: {
      OWN_DOMAIN_SMTP_HOST: 'secure.emailsrvr.com',
      OWN_DOMAIN_SMTP_PORT: '465',
      OWN_DOMAIN_SMTP_USER: 'info@peptidescostarica.net',
      OWN_DOMAIN_SMTP_PASS: 'secret',
    },
    createTransport(config) {
      captured = config;
      return transporter;
    },
  });

  assert.equal(mailer.configured, true);
  assert.equal(mailer.transporter, transporter);
  assert.equal(mailer.from, 'Peptides Costa Rica <info@peptidescostarica.net>');
  assert.equal(mailer.host, 'secure.emailsrvr.com');
  assert.equal(mailer.source, 'rackspace-standalone-trigger');
  assert.equal(captured.secure, true);
  assert.equal(captured.connectionTimeout, 10000);
});

test('missing Rackspace configuration explicitly selects the existing BCC fallback', () => {
  const mailer = resolveTrustpilotTriggerMailer({ env: {} });
  assert.equal(mailer.configured, false);
  assert.equal(mailer.transporter, null);
  assert.equal(mailer.source, 'elastic-bcc-fallback');
});

test('the trigger is sent directly to Trustpilot with no BCC or customer receipt', async () => {
  let message = null;
  const result = await sendTrustpilotTrigger({
    transporter: {
      async sendMail(value) {
        message = value;
        return { accepted: [AFS], rejected: [], messageId: 'rack-1', response: '250 OK' };
      },
    },
    from: 'Peptides Costa Rica <info@peptidescostarica.net>',
    to: AFS,
    recipientEmail: 'buyer@example.com',
    recipientName: 'Ana',
    referenceId: 'WPCR-123',
    locale: 'es-ES',
    transport: 'rackspace-standalone-trigger',
  });

  assert.equal(result.sent, true);
  assert.equal(result.transport, 'rackspace-standalone-trigger');
  assert.equal(message.to, AFS);
  assert.equal(message.bcc, undefined);
  assert.equal(message.cc, undefined);
  assert.match(message.html, /buyer@example\.com/);
});

test('SMTP resolution is not success unless Trustpilot is explicitly accepted', async () => {
  const result = await sendTrustpilotTrigger({
    transporter: {
      async sendMail() {
        return { accepted: [], rejected: [], messageId: 'rack-2' };
      },
    },
    from: 'info@peptidescostarica.net',
    to: AFS,
    recipientEmail: 'buyer@example.com',
    referenceId: 'WPCR-124',
  });

  assert.equal(result.sent, false);
  assert.match(result.error, /silently dropped/);
});

test('invalid AFS addresses are refused before SMTP is called', async () => {
  let calls = 0;
  const result = await sendTrustpilotTrigger({
    transporter: { async sendMail() { calls += 1; } },
    from: 'info@peptidescostarica.net',
    to: 'attacker@example.com',
    recipientEmail: 'buyer@example.com',
    referenceId: 'WPCR-125',
  });

  assert.equal(result.sent, false);
  assert.equal(calls, 0);
});
