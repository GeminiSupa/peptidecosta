import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getOrderMailSettings } from '@/lib/transactionalSmtp';
import { sendTaxRecordsPayoutCopy } from '@/lib/taxRecordsEmail.mjs';
import { resolveTaxRecordsMailer } from '@/lib/taxRecordsSmtp.mjs';
import { stripOwnerAddress } from '@/lib/orderEmailAddressing.mjs';

// The owner is BCC'd on this mail, so they are stripped from the visible
// recipients rather than named twice on the same envelope.
const ADMIN_CC_EMAILS = stripOwnerAddress('info@peptidescostarica.net, omerforce@gmail.com');


const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₡${Math.round(amount).toLocaleString('en-US')}`;
};

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { payoutId, action } = body; // action: 'Approved' or 'Rejected'

    if (!payoutId || !['Approved', 'Rejected'].includes(action)) {
      return NextResponse.json({ error: 'Invalid payload. payoutId and valid action are required.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Fetch the affiliate payout record
    const { data: payout, error: fetchError } = await supabaseAdmin
      .from('affiliate_payouts')
      .select('*')
      .eq('id', payoutId)
      .single();

    if (fetchError || !payout) {
      console.error('[Affiliate Payout Approval] Error fetching payout:', fetchError);
      return NextResponse.json({ error: 'Payout record not found.' }, { status: 404 });
    }

    if (payout.status !== 'Pending') {
      return NextResponse.json({ error: `Payout is already marked as ${payout.status}.` }, { status: 400 });
    }

    // 2. Handle Rejection
    if (action === 'Rejected') {
      const { error: updateError } = await supabaseAdmin
        .from('affiliate_payouts')
        .update({
          status: 'Rejected',
          approved_at: new Date().toISOString()
        })
        .eq('id', payoutId);

      if (updateError) {
        console.error('[Affiliate Payout Approval] Error rejecting payout:', updateError);
        return NextResponse.json({ error: 'Failed to update payout status.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'Rejected' });
    }

    // 3. Handle Approval & Outbound Email
    let emailSent = false;
    let emailError = null;
    let accountingCopy = { sent: false, skipped: 'no email dispatched' };

    if (payout.email_html && payout.affiliate_email) {
      const { smtp, from: notificationFrom } = getOrderMailSettings();
      const transporter = smtp.configured ? nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        }
      }) : null;

      if (transporter) {
        const invoiceText = `Weekly Affiliate Referral Invoice for ${payout.affiliate_name || payout.affiliate_email}.\nGross Referrals USD: ${formatMoney(payout.usd_sales, 'USD')}\nGross Referrals CRC: ${formatMoney(payout.crc_sales, 'CRC')}\nCommission Owed: ${formatMoney(payout.usd_commission, 'USD')} OR ${formatMoney(payout.crc_commission, 'CRC')}\nThat is one payout expressed in two currencies. Choose one—not both.`;

        try {
          const subject = `Weekly Affiliate Referral Commissions Invoice - ${payout.affiliate_name || payout.affiliate_email} [${payout.commission_rate}%]`;
          await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
            from: notificationFrom,
            to: payout.affiliate_email.trim(),
            // Never the accountant: an affiliate is an outside party, and a CC
            // would hand them that address. They get their own copy below.
            cc: ADMIN_CC_EMAILS,
            subject: subject,
            html: payout.email_html,
            text: invoiceText
          });
          emailSent = true;
        } catch (mailErr) {
          console.error(`[Affiliate Payout Approval] Email dispatch failure for ${payout.affiliate_email}:`, mailErr);
          emailError = mailErr.message;
        }

        // Outside the affiliate try/catch on purpose — an approved payout is an
        // expense accounting has to record whether or not the affiliate's own
        // invoice reached them. Never throws.
        const accountingMailer = resolveTaxRecordsMailer();
        accountingCopy = await sendTaxRecordsPayoutCopy({
          transporter: accountingMailer.transporter,
          from: accountingMailer.from,
          payout: {
            kind: 'afiliado',
            name: payout.affiliate_name || payout.affiliate_email,
            email: payout.affiliate_email,
            period: payout.start_date && payout.end_date
              ? `${String(payout.start_date).slice(0, 10)} → ${String(payout.end_date).slice(0, 10)}`
              : null,
          },
          html: payout.email_html,
          text: invoiceText,
          logPrefix: '[Affiliate Payout Approval]',
        });
        accountingCopy.transport = accountingMailer.source;
      } else {
        console.warn('[Affiliate Payout Approval] SMTP credentials missing. Skipping email dispatch.');
        emailError = 'SMTP configurations not set in environment.';
      }
    }

    // 4. Update payout status to Approved
    const { error: updateError } = await supabaseAdmin
      .from('affiliate_payouts')
      .update({
        status: 'Approved',
        approved_at: new Date().toISOString(),
        approved_by: 'Super Admin',
        email_sent: emailSent,
        email_error: emailError,
      })
      .eq('id', payoutId);

    if (updateError) {
      console.error('[Affiliate Payout Approval] Error saving approval state:', updateError);
      return NextResponse.json({ error: 'Failed to update payout approval state in DB.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: 'Approved',
      emailSent,
      emailError,
      // Reported rather than swallowed: "did accounting get this payout?" was
      // unanswerable while the copy rode along as a CC.
      accountingCopy
    });

  } catch (err) {
    console.error('[Affiliate Payout Approval] Critical endpoint crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
