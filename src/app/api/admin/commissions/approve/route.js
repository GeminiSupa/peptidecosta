import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  COMMISSION_ELIGIBLE_ORDER_STATUSES,
  getOrderSalesAmounts,
  isCommissionEligibleOrder,
} from '@/lib/agentOrders';
import { formatPayoutPeriod, recalcPayoutAmounts } from '@/lib/commissionPayouts';
import { buildOverrideBreakdown, computeOverrideAmounts } from '@/lib/subUserCommission.mjs';
import { buildAgentCommissionEmail } from '@/lib/commissionEmail';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';

// Email Configuration from Environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'omerforce@gmail.com'}>`;
const ADMIN_CC_EMAILS = 'info@peptidescostarica.net, omerforce@gmail.com';

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { payoutId, action } = body; // action can be 'Approved' or 'Rejected'

    if (!payoutId || !['Approved', 'Rejected'].includes(action)) {
      return NextResponse.json({ error: 'Invalid payload. payoutId and valid action are required.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { rate: currentExchangeRate } = await getDatabaseBackedUsdToCrcRate();

    // 1. Fetch the payout record
    const { data: payout, error: fetchError } = await supabaseAdmin
      .from('commission_payouts')
      .select('*')
      .eq('id', payoutId)
      .single();

    if (fetchError || !payout) {
      console.error('[Commission Approval] Error fetching payout:', fetchError);
      return NextResponse.json({ error: 'Payout record not found.' }, { status: 404 });
    }

    if (payout.status !== 'Pending') {
      return NextResponse.json({ error: `Payout is already marked as ${payout.status}.` }, { status: 400 });
    }

    // 2. Handle Rejection
    if (action === 'Rejected') {
      const { error: updateError } = await supabaseAdmin
        .from('commission_payouts')
        .update({
          status: 'Rejected',
          approved_at: new Date().toISOString()
        })
        .eq('id', payoutId);

      if (updateError) {
        console.error('[Commission Approval] Error rejecting payout:', updateError);
        return NextResponse.json({ error: 'Failed to update payout status.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'Rejected' });
    }

    // Refresh the saved order snapshots before approval. This prevents orders
    // that are still pending from being paid and picks up orders completed
    // since the commission scan was generated.
    const savedOrders = Array.isArray(payout.orders_data) ? payout.orders_data : [];
    const savedOrderIds = savedOrders.map((order) => order?.id).filter(Boolean);
    let eligibleOrders = savedOrders
      .filter(isCommissionEligibleOrder)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (savedOrderIds.length > 0) {
      const { data: currentOrders, error: currentOrdersError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .in('id', savedOrderIds)
        .in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES)
        .order('created_at', { ascending: false });

      if (currentOrdersError) {
        console.error('[Commission Approval] Could not refresh order statuses:', currentOrdersError);
      } else {
        eligibleOrders = currentOrders || [];
      }
    }

    let usdSales = 0;
    let crcSales = 0;
    for (const order of eligibleOrders) {
      const amounts = getOrderSalesAmounts(order, currentExchangeRate);
      usdSales += amounts.usd;
      crcSales += amounts.crc;
    }

    // The 2% override on sub-users' orders gets the same treatment as her own
    // sales: re-check eligibility at approval time so an order that slipped back
    // to pending since the scan is not paid on.
    const savedOverrideOrders = Array.isArray(payout.override_orders_data)
      ? payout.override_orders_data
      : [];
    const savedOverrideIds = savedOverrideOrders.map((order) => order?.id).filter(Boolean);
    let eligibleOverrideOrders = savedOverrideOrders.filter(isCommissionEligibleOrder);

    if (savedOverrideIds.length > 0) {
      const { data: currentOverrideOrders, error: overrideOrdersError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .in('id', savedOverrideIds)
        .in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES)
        .order('created_at', { ascending: false });

      if (overrideOrdersError) {
        console.error('[Commission Approval] Could not refresh sub-user order statuses:', overrideOrdersError);
      } else {
        eligibleOverrideOrders = currentOverrideOrders || [];
      }
    }

    let overrideSalesUsd = 0;
    let overrideSalesCrc = 0;
    for (const order of eligibleOverrideOrders) {
      const amounts = getOrderSalesAmounts(order, currentExchangeRate);
      overrideSalesUsd += amounts.usd;
      overrideSalesCrc += amounts.crc;
    }
    const { overrideUsd, overrideCrc } = computeOverrideAmounts({
      usdSales: overrideSalesUsd,
      crcSales: overrideSalesCrc,
      overrideRate: payout.override_rate,
    });

    const recalculated = recalcPayoutAmounts({
      usdSales,
      crcSales,
      commissionRate: payout.commission_rate,
      weeklySalary: payout.weekly_salary_paid,
      salaryCurrency: payout.salary_currency,
      exchangeRate: currentExchangeRate,
      overrideUsd,
      overrideCrc,
    });
    const periodDisplay = formatPayoutPeriod(payout.start_date, payout.end_date);
    const { html: refreshedEmailHtml, text: refreshedEmailText } = buildAgentCommissionEmail({
      agentName: payout.agent_name || payout.agent_email,
      periodDisplay,
      commissionRate: payout.commission_rate,
      weeklySalary: payout.weekly_salary_paid,
      salaryCurrency: payout.salary_currency,
      usdSales,
      crcSales,
      usdCommission: recalculated.usd_commission,
      crcCommission: recalculated.crc_commission,
      totalPayoutUsd: recalculated.total_payout_usd,
      totalPayoutCrc: recalculated.total_payout_crc,
      orders: eligibleOrders,
      overrideRate: payout.override_rate,
      overrideUsd,
      overrideCrc,
      overrideBreakdown: buildOverrideBreakdown(
        eligibleOverrideOrders,
        payout.override_rate,
        (order) => getOrderSalesAmounts(order, currentExchangeRate)
      ),
    });

    // 3. Handle Approval & Outbound Email
    let emailSent = false;
    let emailError = null;

    if (payout.agent_email) {
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
          const subject = `Weekly Commissions Invoice - ${payout.agent_name || payout.agent_email} [${payout.commission_rate}%]`;
          await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
            from: NOTIFICATION_FROM,
            to: payout.agent_email.trim(),
            cc: ADMIN_CC_EMAILS,
            subject: subject,
            html: refreshedEmailHtml,
            text: refreshedEmailText,
          });
          emailSent = true;
        } catch (mailErr) {
          console.error(`[Commission Approval] Email dispatch failure for ${payout.agent_email}:`, mailErr);
          emailError = mailErr.message;
          // We will still proceed with updating the DB so we don't block state, but we flag it in response
        }
      } else {
        console.warn('[Commission Approval] SMTP credentials missing. Skipping email dispatch.');
        emailError = 'SMTP configurations not set in environment.';
      }
    }

    // 4. Update payout status to Approved
    const { error: updateError } = await supabaseAdmin
      .from('commission_payouts')
      .update({
        status: 'Approved',
        usd_sales: usdSales,
        crc_sales: crcSales,
        usd_commission: recalculated.usd_commission,
        crc_commission: recalculated.crc_commission,
        total_payout_usd: recalculated.total_payout_usd,
        total_payout_crc: recalculated.total_payout_crc,
        orders_data: eligibleOrders,
        // Written back so the per-agent paid index in weekly-report knows these
        // orders are settled for THIS agent, without touching the sub-user's own
        // outstanding 8% on the same orders.
        override_usd: overrideUsd,
        override_crc: overrideCrc,
        override_sales_usd: overrideSalesUsd,
        override_sales_crc: overrideSalesCrc,
        override_orders_data: eligibleOverrideOrders,
        email_html: refreshedEmailHtml,
        approved_at: new Date().toISOString(),
        approved_by: 'Super Admin' // Can be customized if user authentication details are available
      })
      .eq('id', payoutId);

    if (updateError) {
      console.error('[Commission Approval] Error saving approval state:', updateError);
      return NextResponse.json({ error: 'Failed to update payout approval state in DB.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: 'Approved',
      emailSent,
      emailError
    });

  } catch (err) {
    console.error('[Commission Approval] Critical endpoint crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
