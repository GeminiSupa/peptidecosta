import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getOrderMailSettings } from '@/lib/transactionalSmtp';
import { getReviewSettings } from '@/lib/reviewSettings.mjs';
import { trustpilotAfsSnippet } from '@/lib/trustpilotAfs.mjs';
import { resolveTrustpilotTriggerMailer, sendTrustpilotTrigger } from '@/lib/trustpilotTrigger.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Prove the Trustpilot pipeline end to end, in one click.
 *
 * WHY THIS IS NEEDED
 *
 * The old BCC was not observable separately from the customer receipt. The
 * preferred path now sends Trustpilot a dedicated trigger through Rackspace,
 * with its own SMTP result and message id. Deployments without that mailbox
 * retain the old Elastic BCC as a safe fallback.
 *
 * So the only honest test is to send one real message through whichever path is
 * live and then look at Trustpilot's Invitations screen.
 *
 * It really does ask Trustpilot to send a review invitation to that address, so
 * it is meant for the team's own inboxes, never a customer's.
 */

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const to = String(body?.to || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'Enter the email address to send the test to.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const settings = await getReviewSettings(supabase);
    const bcc = settings.trustpilotAfsBcc
      || process.env.TRUSTPILOT_AFS_BCC
      || 'peptidescostarica.net+7777886f21@invite.trustpilot.com';

    const { smtp, from } = getOrderMailSettings();
    const trustpilotMailer = resolveTrustpilotTriggerMailer();
    const useRackspaceTrigger = settings.trustpilotDeliveryMode === 'trigger'
      && trustpilotMailer.configured;
    if (!useRackspaceTrigger && !smtp.configured) {
      return NextResponse.json({
        error: 'Neither the Rackspace trigger nor transactional email is configured, so nothing could be sent.',
      }, { status: 500 });
    }

    const transporter = useRackspaceTrigger ? null : nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    });

    // A reference Trustpilot has certainly never seen, so this cannot collide
    // with a real order and the invitation is easy to find in their list.
    const reference = `TEST-${Date.now().toString(36).toUpperCase()}`;

    // The test has to exercise whichever method is actually live, or it proves
    // the wrong path — which is the whole failure this card was built to catch.
    if (useRackspaceTrigger) {
      const result = await sendTrustpilotTrigger({
        transporter: trustpilotMailer.transporter,
        from: trustpilotMailer.from,
        to: bcc,
        recipientEmail: to,
        recipientName: 'Trustpilot test',
        referenceId: reference,
        locale: 'en-US',
        logPrefix: '[admin/reviews/trustpilot-test]',
        transport: trustpilotMailer.source,
      });
      return NextResponse.json({
        sent: result.sent,
        method: 'trigger',
        reference,
        to,
        bcc,
        bccSource: settings.trustpilotAfsBcc ? 'panel' : (process.env.TRUSTPILOT_AFS_BCC ? 'env' : 'default'),
        from: trustpilotMailer.from,
        smtpHost: trustpilotMailer.host,
        accepted: result.accepted || [],
        rejected: result.rejected || [],
        bccAccepted: result.sent,
        messageId: result.messageId || '',
        message: result.sent
          ? `Rackspace accepted the trigger for ${to}. Now open Trustpilot -> Invitations and look for ${reference}. If it is not there, the remaining fault is after Rackspace accepted it: downstream delivery or Trustpilot's AFS intake.`
          : `Rackspace did not accept the Trustpilot trigger: ${result.error}`,
      });
    }

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;max-width:600px;margin:0 auto;">
        <h2 style="margin:0 0 12px;">Trustpilot invitation test</h2>
        <p style="margin:0 0 12px;">This message was sent from the Social Reviews panel to check that Trustpilot is still receiving our invitations.</p>
        <p style="margin:0 0 12px;">Reference: <strong>${reference}</strong></p>
        <p style="margin:0;color:#64748b;font-size:13px;">If Trustpilot is working, this reference appears on Trustpilot under Analytics &rarr; Performance &rarr; Invitations within a few minutes, and an invitation email follows on Trustpilot's own delay.</p>
      </div>` + trustpilotAfsSnippet({
      recipientEmail: to,
      recipientName: 'Trustpilot test',
      referenceId: reference,
      locale: 'en-US',
    });

    const info = await transporter.sendMail({
      from,
      to,
      bcc,
      subject: `Trustpilot invitation test ${reference} - Peptides Costa Rica`,
      html,
      text: `Trustpilot invitation test. Reference: ${reference}.`,
    });

    // accepted/rejected come straight from the SMTP conversation. They are the
    // only per-recipient truth available: if the BCC is in `rejected` the mail
    // never left for Trustpilot at all, and the panel can say so instead of
    // reporting a clean send.
    const accepted = (info.accepted || []).map(String);
    const rejected = (info.rejected || []).map(String);
    const bccAccepted = accepted.some((a) => a.toLowerCase() === bcc.toLowerCase());

    return NextResponse.json({
      sent: true,
      method: 'bcc',
      reference,
      to,
      bcc,
      bccSource: settings.trustpilotAfsBcc ? 'panel' : (process.env.TRUSTPILOT_AFS_BCC ? 'env' : 'default'),
      from,
      smtpHost: smtp.host,
      accepted,
      rejected,
      bccAccepted,
      messageId: info.messageId || '',
      message: bccAccepted
        ? `Elastic accepted the receipt and Trustpilot BCC. Now open Trustpilot -> Analytics -> Performance -> Invitations and look for ${reference}. If it is not there, SMTP acceptance alone cannot distinguish downstream delivery from a Trustpilot AFS intake failure.`
        : `The mail server did not accept ${bcc}, so no Trustpilot invitation was submitted. Check the address and the mail-provider response.`,
    });
  } catch (err) {
    console.error('[admin/reviews/trustpilot-test]', err);
    return NextResponse.json({ error: err.message || 'The test could not be sent' }, { status: 500 });
  }
}
