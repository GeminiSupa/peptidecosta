import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getTransactionalSmtpConfig } from '@/lib/transactionalSmtp';

// Email Configuration from Environment variables
const { host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE, user: SMTP_USER, pass: SMTP_PASS } = getTransactionalSmtpConfig();
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'omerforce@gmail.com'}>`;
const ADMIN_CC_EMAILS = 'info@peptidescostarica.net, omerforce@gmail.com';

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

    if (payout.email_html && payout.affiliate_email) {
      const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASS) ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        }
      }) : null;

      if (transporter) {
        try {
          const subject = `Weekly Affiliate Referral Commissions Invoice - ${payout.affiliate_name || payout.affiliate_email} [${payout.commission_rate}%]`;
          await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
            from: NOTIFICATION_FROM,
            to: payout.affiliate_email.trim(),
            cc: ADMIN_CC_EMAILS,
            subject: subject,
            html: payout.email_html,
            text: `Weekly Affiliate Referral Invoice for ${payout.affiliate_name || payout.affiliate_email}.\nGross Referrals USD: ${formatMoney(payout.usd_sales, 'USD')}\nGross Referrals CRC: ${formatMoney(payout.crc_sales, 'CRC')}\nCommission Owed: ${formatMoney(payout.usd_commission, 'USD')} OR ${formatMoney(payout.crc_commission, 'CRC')}\nThat is one payout expressed in two currencies. Choose one—not both.`
          });
          emailSent = true;
        } catch (mailErr) {
          console.error(`[Affiliate Payout Approval] Email dispatch failure for ${payout.affiliate_email}:`, mailErr);
          emailError = mailErr.message;
        }
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
        approved_by: 'Super Admin'
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
      emailError
    });

  } catch (err) {
    console.error('[Affiliate Payout Approval] Critical endpoint crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
