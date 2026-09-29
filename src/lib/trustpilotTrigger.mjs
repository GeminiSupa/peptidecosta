/**
 * The Trustpilot AFS trigger email.
 *
 * Trustpilot documents two ways to start a verified review invitation, and they
 * are alternatives — never both at once, because each one that lands creates an
 * invitation and the plan counts them separately:
 *
 *   BCC     — copy the invitation address on the customer's own receipt.
 *   TRIGGER — send the invitation address its own small email, addressed to
 *             Trustpilot and nobody else, carrying the same structured data
 *             block. Trustpilot's guide: "Set up Automatic Feedback Service
 *             (AFS) using a separate trigger email".
 *
 * This module is the trigger. It exists because the BCC is invisible. It rides
 * inside the customer's receipt, so "did the invitation go out?" and "did the
 * receipt go out?" collapse into one fact, and nothing on our side could ever
 * tell them apart. A trigger is its own message, with its own per-recipient
 * answer from the mail server and its own line in the log.
 *
 * It also takes the <script> block out of the customer's receipt, where it does
 * nothing for the customer and does real harm: a script tag in a message body
 * is one of the strongest spam signals there is, and the accounting copy of
 * that same body was rejected outright twice, 26 Aug and 3 Sep 2026, with
 * "550 5.7.1 ... detected sending high likelihood spam".
 *
 * Nothing here decides WHETHER to invite. That is the order route's job, which
 * owns the monthly cap, the platform split and the per-customer ask history.
 */

import nodemailer from 'nodemailer';
import { getOwnDomainSmtpConfig } from './ownDomainSmtp.mjs';
import { isTrustpilotAfsAddress, trustpilotAfsSnippet } from './trustpilotAfs.mjs';

const SMTP_TIMEOUTS = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
};

/**
 * Resolve the dedicated AFS sender at request time.
 *
 * The trigger deliberately uses the existing low-volume Rackspace mailbox,
 * not ORDER_SMTP_*: separating the message but leaving it on Elastic would
 * preserve the same unobservable reseller/MTA hop that prompted this change.
 */
export function resolveTrustpilotTriggerMailer({
  env = process.env,
  createTransport = (config) => nodemailer.createTransport(config),
} = {}) {
  const smtp = getOwnDomainSmtpConfig(env);
  if (!smtp.configured) {
    return {
      configured: false,
      transporter: null,
      from: smtp.from,
      host: smtp.host || '',
      source: 'elastic-bcc-fallback',
    };
  }

  return {
    configured: true,
    transporter: createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      ...SMTP_TIMEOUTS,
    }),
    from: smtp.from,
    host: smtp.host,
    source: 'rackspace-standalone-trigger',
  };
}

/**
 * The body of a trigger email.
 *
 * Deliberately tiny. Only Trustpilot's parser ever reads it, so it carries the
 * structured block and one line of prose explaining what the message is, for
 * whoever finds a copy of it in a mail log.
 *
 * The block is built by the same trustpilotAfsSnippet the BCC path uses. A
 * second copy of that formatting would mean a passing test proved only the
 * test, which is exactly how this went unnoticed for two months.
 */
export function trustpilotTriggerHtml({ recipientEmail, recipientName, referenceId, locale }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#334155;">
  <p>Automated Trustpilot review invitation trigger for order ${referenceId || '(no reference)'}. This message is addressed to Trustpilot only and is never sent to a customer.</p>
</div>${trustpilotAfsSnippet({ recipientEmail, recipientName, referenceId, locale })}`;
}

/**
 * Ask Trustpilot to invite one customer.
 *
 * Never throws. A failed invitation must not cost the customer their receipt or
 * the accountant their copy, so the caller gets a result object and decides.
 *
 * @param {object} input
 * @param {object} input.transporter - a nodemailer transport, or null
 * @param {string} input.from
 * @param {string} input.to - the @invite.trustpilot.com address
 * @param {string} input.recipientEmail - the customer Trustpilot should invite
 * @param {string} [input.recipientName]
 * @param {string} [input.referenceId] - the order number
 * @param {string} [input.locale]
 * @param {string} [input.logPrefix]
 * @returns {Promise<{sent: boolean, to: string, messageId?: string, accepted?: string[], error?: string}>}
 */
export async function sendTrustpilotTrigger({
  transporter,
  from,
  to,
  recipientEmail,
  recipientName = 'Cliente',
  referenceId = '',
  locale = 'es-ES',
  logPrefix = '[Trustpilot trigger]',
  transport = 'standalone-trigger',
} = {}) {
  const address = String(to || '').trim();
  const invitee = String(recipientEmail || '').trim();

  // Guarded the same way the BCC was. This message names a customer and asks a
  // third party to email them; an address that is not a Trustpilot invitation
  // address has no business receiving it, so a mistyped setting sends nothing
  // at all rather than handing a stranger a customer's email address.
  if (!isTrustpilotAfsAddress(address)) {
    const error = `"${address || 'nothing'}" is not an @invite.trustpilot.com address; no invitation sent.`;
    console.error(`${logPrefix} ${error}`);
    return { sent: false, to: address, error, transport };
  }
  if (!invitee) {
    const error = 'No customer email to invite; no invitation sent.';
    console.error(`${logPrefix} ${error}`);
    return { sent: false, to: address, error, transport };
  }
  if (!transporter) {
    const error = 'Rackspace SMTP is not configured; no invitation sent.';
    console.error(`${logPrefix} ${error}`);
    return { sent: false, to: address, error, transport };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: address,
      subject: `Trustpilot invitation${referenceId ? ` — ${referenceId}` : ''}`,
      html: trustpilotTriggerHtml({ recipientEmail: invitee, recipientName, referenceId, locale }),
      // No JSON in the plain-text part. Trustpilot reads the HTML body, and a
      // second copy of the block risks being counted as a second invitation.
      text: `Automated Trustpilot review invitation trigger for order ${referenceId || '(no reference)'}.`,
    });

    // The test is "was it ACCEPTED", never "was it absent from rejected". A
    // recipient the server silently drops appears in neither list, and reading
    // that as success is how this whole problem stayed invisible: every weak
    // signal we had said "sent".
    const accepted = (info.accepted || []).map((a) => String(a).toLowerCase());
    const rejected = (info.rejected || []).map((a) => String(a).toLowerCase());
    if (!accepted.includes(address.toLowerCase())) {
      const how = rejected.includes(address.toLowerCase()) ? 'REJECTED' : 'silently dropped';
      const error = `${address} was ${how} by the mail server; no invitation for ${referenceId || invitee}.`;
      console.error(`${logPrefix} ${error} accepted=${JSON.stringify(accepted)} rejected=${JSON.stringify(rejected)} messageId=${info.messageId || ''}`);
      return { sent: false, to: address, error, accepted, rejected, messageId: info.messageId || '', transport };
    }

    // The submission id, so a message can be traced with the mail provider or
    // handed to Trustpilot support. It is the only identifier that exists on
    // both sides of the handoff.
    //
    // Even this only proves our mail server took the address. Whether it was
    // delivered to Trustpilot, and whether Trustpilot turned it into an
    // invitation, are two further steps nothing here can see.
    console.log(`${logPrefix} accepted for ${referenceId || invitee}; messageId=${info.messageId || ''} smtpResponse=${info.response || ''}`);
    return {
      sent: true,
      to: address,
      accepted,
      rejected,
      messageId: info.messageId || '',
      response: info.response || '',
      transport,
    };
  } catch (err) {
    console.error(`${logPrefix} send failed:`, err);
    return { sent: false, to: address, error: err.message || 'send failed', transport };
  }
}
