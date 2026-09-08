/**
 * Lead alerts to our own inbox leave through our own mail host.
 *
 * The order route was given this in ownDomainSmtp.mjs; the lead alert was not,
 * and it addresses the same inbox. Rackspace hosts peptidescostarica.net and
 * refuses mail claiming to be from that domain when it arrives from anywhere
 * else — after Elastic has already accepted the submission and returned
 * success, so the app records `sent` and nothing is ever seen.
 *
 * Between 2 and 8 Sep 2026 that cost nineteen leads: every one reached
 * catalog_leads, every alert was recorded delivered, and info@peptidescostarica.net
 * received none of them. The last alert that actually arrived was 2 Sep.
 *
 * These tests pin the two rules that matter: our own addresses move to the
 * Rackspace host presenting the mailbox's own address, and nobody else moves.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOwnDomainSmtpConfig,
  isOwnDomainAddress,
  splitOwnDomainRecipients,
} from '../src/lib/ownDomainSmtp.mjs';
import { buildEmailDiagnostics } from '../src/lib/emailDiagnostics.mjs';

const RACKSPACE = {
  OWN_DOMAIN_SMTP_HOST: 'secure.emailsrvr.com',
  OWN_DOMAIN_SMTP_USER: 'info@peptidescostarica.net',
  OWN_DOMAIN_SMTP_PASS: 'secret',
};

/** The audience getLeadAlertAudience returns for an adwords_lp lead. */
const AD_LANDING_AUDIENCE = [
  'elainedrb@gmail.com',
  'daniela@peptidescostarica.net',
  'info@peptidescostarica.net',
];

test('the team inbox is routed to our own host, the gmail recipients are not', () => {
  const routed = AD_LANDING_AUDIENCE.map((destination) => ({
    destination,
    viaOwnHost: isOwnDomainAddress(destination),
  }));

  assert.deepEqual(routed, [
    { destination: 'elainedrb@gmail.com', viaOwnHost: false },
    { destination: 'daniela@peptidescostarica.net', viaOwnHost: true },
    { destination: 'info@peptidescostarica.net', viaOwnHost: true },
  ]);
});

test('the own-host copy presents the mailbox address, not ORDER_NOTIFICATION_FROM', () => {
  // ORDER_NOTIFICATION_FROM is set in production to
  // "Peptides Costa Rica <info@peptidescostarica.net>". Sending that through
  // Elastic is the thing Rackspace refuses; sending it as the authenticated
  // Rackspace user is the thing it accepts. The From has to come off the
  // mailbox, so the two must not be confused.
  const cfg = getOwnDomainSmtpConfig(RACKSPACE);
  assert.equal(cfg.configured, true);
  assert.equal(cfg.from, 'Peptides Costa Rica <info@peptidescostarica.net>');
  assert.equal(cfg.port, 465);
  assert.equal(cfg.secure, true, '465 is implicit TLS');
});

test('unconfigured, every recipient stays on Elastic exactly as before', () => {
  // The change must be inert until someone sets the three variables, so it can
  // ship without waiting for them.
  assert.equal(getOwnDomainSmtpConfig({}).configured, false);
  assert.equal(getOwnDomainSmtpConfig({ OWN_DOMAIN_SMTP_HOST: 'secure.emailsrvr.com' }).configured, false);
});

test('the legacy route splits its list instead of sending one mixed message', () => {
  // The pre-outbox path addressed info@ in `to` and everyone else in `bcc`.
  // Passing recipients as an array matters: a comma-joined string reads as one
  // unparseable address and would send the whole list down a single route.
  const split = splitOwnDomainRecipients({
    to: ['info@peptidescostarica.net'],
    bcc: ['elainedrb@gmail.com', 'daniela@peptidescostarica.net'],
  });

  assert.deepEqual(split.ownRecipients,
    ['info@peptidescostarica.net', 'daniela@peptidescostarica.net']);
  assert.deepEqual(split.rest.to, [], 'the own address left the To');
  assert.deepEqual(split.rest.bcc, ['elainedrb@gmail.com']);
  assert.equal(split.hasOwn, true);
  assert.equal(split.hasRest, true, 'Elastic still has someone to send to');
});

test('a joined string would have routed a gmail address through Rackspace', () => {
  // Guards the shape the route used before: bcc: recipients.join(', ').
  //
  // The splitter reads one address per entry, so the joined string is a single
  // entry. It ends with "@peptidescostarica.net", so the own-domain test says
  // yes and the WHOLE string is handed to Rackspace — carrying
  // elainedrb@gmail.com with it. That is worse than failing to route: it pushes
  // outside mail through the business mailbox, which is what got that mailbox
  // blocked in August. Hence the array.
  const wrong = splitOwnDomainRecipients({
    to: ['info@peptidescostarica.net'],
    bcc: 'elainedrb@gmail.com, daniela@peptidescostarica.net',
  });

  assert.deepEqual(wrong.ownRecipients, [
    'info@peptidescostarica.net',
    'elainedrb@gmail.com, daniela@peptidescostarica.net',
  ]);
  assert.equal(wrong.hasRest, false, 'Elastic is left with nothing at all');
});

test('an all-own audience leaves Elastic nothing to send', () => {
  // sendMail with an empty recipient list throws, which would report an alert
  // the team did receive as a total failure.
  const split = splitOwnDomainRecipients({ to: ['info@peptidescostarica.net'] });
  assert.equal(split.hasOwn, true);
  assert.equal(split.hasRest, false);
});

test('the diagnostics endpoint names an unconfigured own-domain host as a problem', () => {
  // This endpoint is how the outage gets checked, so silence here is what let
  // it run from 2 Sep unnoticed.
  const transactional = {
    configured: true, user: 'elastic-login', pass: 'x',
    host: 'smtp.elasticemail.com', port: 2525, secure: false,
  };

  const broken = buildEmailDiagnostics({
    env: { ORDER_NOTIFICATION_FROM: 'Peptides Costa Rica <info@peptidescostarica.net>' },
    transactional,
    campaign: { configured: true },
  });
  assert.equal(broken.ownDomain.configured, false);
  assert.ok(
    broken.problems.some((line) => /Own-domain SMTP is NOT configured/.test(line)),
    'the report has to say so out loud',
  );

  const fixed = buildEmailDiagnostics({
    env: { ...RACKSPACE, ORDER_NOTIFICATION_FROM: 'Peptides Costa Rica <info@peptidescostarica.net>' },
    transactional,
    campaign: { configured: true },
  });
  assert.equal(fixed.ownDomain.configured, true);
  assert.equal(fixed.ownDomain.host, 'secure.emailsrvr.com');
  assert.ok(
    !fixed.problems.some((line) => /Own-domain SMTP is NOT configured/.test(line)),
    'and to stop saying so once it is set',
  );
});

test('the password is never echoed back by the diagnostics', () => {
  const report = buildEmailDiagnostics({
    env: RACKSPACE,
    transactional: { configured: true, user: 'elastic-login' },
    campaign: { configured: true },
  });
  assert.equal(report.ownDomain.passwordPresent, true);
  assert.equal(JSON.stringify(report).includes('secret'), false);
});
