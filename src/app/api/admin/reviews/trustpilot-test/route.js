import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getOrderMailSettings } from '@/lib/transactionalSmtp';
import { getReviewSettings } from '@/lib/reviewSettings.mjs';
import { trustpilotAfsSnippet } from '@/lib/trustpilotAfs.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Prove the Trustpilot pipeline end to end, in one click.
 *
 * WHY THIS IS NEEDED
 *
 * Nothing about a Trustpilot invitation is observable from our side. We BCC an
 * address and Trustpilot mails the customer days later; if the address is
 * wrong, or Trustpilot has stopped accepting our mail, the BCC is delivered to
 * nowhere and every single signal we have still reads "sent". Between August
 * and September 2026 that silence ran for two months — 75 invitations recorded
 * as sent in September alone, and Trustpilot's own dashboard reporting zero
 * invitations delivered in the same period.
 *
 * So the only honest test is to send one real message through the real path and
 * then look at Trustpilot's Invitations screen. This sends exactly what a
 * customer receipt sends — same sender, same SMTP account, same BCC, same AFS
 * data block — to an address the admin nominates.
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
    if (!smtp.configured) {
      return NextResponse.json({
        error: 'Transactional email is not configured, so nothing could be sent.',
      }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    });

    // A reference Trustpilot has certainly never seen, so this cannot collide
    // with a real order and the invitation is easy to find in their list.
    const reference = `TEST-${Date.now().toString(36).toUpperCase()}`;

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
        ? `Sent. Now open Trustpilot -> Analytics -> Performance -> Invitations and look for ${reference}. If it is not there within a few minutes, Trustpilot is not receiving our BCC and the address above is wrong or no longer active.`
        : `The mail server did not accept ${bcc}, so Trustpilot was never sent anything. That address is wrong.`,
    });
  } catch (err) {
    console.error('[admin/reviews/trustpilot-test]', err);
    return NextResponse.json({ error: err.message || 'The test could not be sent' }, { status: 500 });
  }
}
