/**
 * Own-domain order alerts leave through our own mail host.
 *
 * Rackspace hosts peptidescostarica.net and refuses mail claiming to be from
 * that domain when it arrives from anywhere else. Elastic accepts the
 * submission and reports success, so from 12 Aug 2026 every new-order alert to
 * info@peptidescostarica.net was thrown away after the app had already logged
 * it as delivered.
 *
 * Only own-domain recipients move to Rackspace. Everyone else stays on
 * Elastic: the business mailbox is not a sending platform, and pushing general
 * volume through it is what caused the original block.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailAddressOf, isOwnDomainAddress, getOwnDomainSmtpConfig,
  splitOwnDomainRecipients, OWN_MAIL_DOMAIN,
} from '../src/lib/ownDomainSmtp.mjs';

test('our own mailboxes are recognised, however they are written', () => {
  assert.equal(isOwnDomainAddress('info@peptidescostarica.net'), true);
  assert.equal(isOwnDomainAddress('INFO@PeptidesCostaRica.NET'), true);
  assert.equal(isOwnDomainAddress('Ops <daniela@peptidescostarica.net>'), true);
  assert.equal(isOwnDomainAddress('  sean@peptidescostarica.net  '), true);

  assert.equal(isOwnDomainAddress('omerforce@gmail.com'), false);
  assert.equal(isOwnDomainAddress('joe@tolm.co'), false);
  // A lookalike domain must not be routed to our mailbox.
  assert.equal(isOwnDomainAddress('info@peptidescostarica.net.evil.com'), false);
  assert.equal(isOwnDomainAddress('info@notpeptidescostarica.net'), false);
  assert.equal(isOwnDomainAddress(''), false);
  assert.equal(isOwnDomainAddress(null), false);
});

test('the address is read out of a display name', () => {
  assert.equal(emailAddressOf('Ops inbox <info@peptidescostarica.net>'), 'info@peptidescostarica.net');
  assert.equal(emailAddressOf('plain@example.com'), 'plain@example.com');
  assert.equal(emailAddressOf(''), '');
});

test('only our own addresses are moved; everyone else stays put', () => {
  const split = splitOwnDomainRecipients({
    to: ['info@peptidescostarica.net', 'omerforce@gmail.com'],
    cc: ['daniela@peptidescostarica.net', 'korinneda@icloud.com'],
    bcc: ['joe@tolm.co'],
  });

  assert.deepEqual(split.ownRecipients, ['info@peptidescostarica.net', 'daniela@peptidescostarica.net']);
  assert.deepEqual(split.rest.to, ['omerforce@gmail.com']);
  assert.deepEqual(split.rest.cc, ['korinneda@icloud.com']);
  assert.deepEqual(split.rest.bcc, ['joe@tolm.co']);
  assert.equal(split.hasOwn, true);
  assert.equal(split.hasRest, true);
});

test('a mailbox listed twice is mailed once', () => {
  const split = splitOwnDomainRecipients({
    to: ['info@peptidescostarica.net'],
    cc: ['Ops <INFO@peptidescostarica.net>'],
  });
  assert.equal(split.ownRecipients.length, 1);
});

test('a list with none of ours leaves the send untouched', () => {
  const split = splitOwnDomainRecipients({ to: ['omerforce@gmail.com'], cc: [], bcc: [] });
  assert.equal(split.hasOwn, false);
  assert.equal(split.hasRest, true);
  assert.deepEqual(split.rest.to, ['omerforce@gmail.com']);
});

test('a list of only ours leaves nothing for Elastic to send', () => {
  // The caller must skip the Elastic send entirely here — a sendMail with no
  // recipients throws, and would report the whole alert as failed.
  const split = splitOwnDomainRecipients({ to: ['info@peptidescostarica.net'] });
  assert.equal(split.hasOwn, true);
  assert.equal(split.hasRest, false);
});

test('without configuration nothing is routed anywhere new', () => {
  assert.equal(getOwnDomainSmtpConfig({}).configured, false);
  assert.equal(getOwnDomainSmtpConfig({ OWN_DOMAIN_SMTP_HOST: 'secure.emailsrvr.com' }).configured, false);

  const full = getOwnDomainSmtpConfig({
    OWN_DOMAIN_SMTP_HOST: 'secure.emailsrvr.com',
    OWN_DOMAIN_SMTP_USER: 'info@peptidescostarica.net',
    OWN_DOMAIN_SMTP_PASS: 'secret',
  });
  assert.equal(full.configured, true);
  assert.equal(full.port, 465);
  assert.equal(full.secure, true, '465 is implicit TLS');
  assert.equal(full.from, 'Peptides Costa Rica <info@peptidescostarica.net>');
});

test('port 587 is STARTTLS, not implicit TLS', () => {
  const cfg = getOwnDomainSmtpConfig({
    OWN_DOMAIN_SMTP_HOST: 'secure.emailsrvr.com',
    OWN_DOMAIN_SMTP_PORT: '587',
    OWN_DOMAIN_SMTP_USER: 'info@peptidescostarica.net',
    OWN_DOMAIN_SMTP_PASS: 'secret',
  });
  assert.equal(cfg.secure, false);
});

test('the domain is the real one, not a placeholder', () => {
  assert.equal(OWN_MAIL_DOMAIN, 'peptidescostarica.net');
});
