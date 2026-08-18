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
import { SUB_USER_PAYOUT_COLUMNS, writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { buildAgentCommissionEmail } from '@/lib/commissionEmail';
import {
  commissionRateLabel,
  decorateCommissionOrder,
  summarizeOrderCommissions,
} from '@/lib/orderCommission.mjs';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import { withTaxRecordsCc } from '@/lib/taxRecordsEmail.mjs';
import { commissionSourceLabel } from '@/lib/salesAgentAffiliate.mjs';
import { getOrderMailSettings } from '@/lib/transactionalSmtp';
import { stripOwnerAddress } from '@/lib/orderEmailAddressing.mjs';

// The owner is BCC'd on this mail, so they are stripped from the visible
// recipients rather than named twice on the same envelope.
const ADMIN_CC_EMAILS = stripOwnerAddress('info@peptidescostarica.net, omerforce@gmail.com');


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

    // Approval must price each order the same way the weekly scan did: at the
    // order's own rate when it carries one (an agent referral pays a combined
    // 20%), not at the profile's flat rate. Recomputing from usdSales * rate
    // here would quietly pay a 20% referral week at 10%.
    const commissionSummary = summarizeOrderCommissions(
      eligibleOrders,
      payout.commission_rate,
      (order) => getOrderSalesAmounts(order, currentExchangeRate)
    );
    const usdSales = commissionSummary.usdSales;
    const crcSales = commissionSummary.crcSales;

    // The per-order rate, source label and earnings the statement table reads
    // from. Raw `orders` rows carry none of them, so an undecorated list renders
    // every line as "0% · earned ₡0" next to a non-zero total.
    const reportedOrders = eligibleOrders.map((order) => decorateCommissionOrder(
      order,
      payout.commission_rate,
      (row) => getOrderSalesAmounts(row, currentExchangeRate),
      commissionSourceLabel
    ));

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
      usdCommissionOverride: commissionSummary.usdCommission,
      crcCommissionOverride: commissionSummary.crcCommission,
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
      commissionRate: commissionRateLabel(commissionSummary.rates, payout.commission_rate),
      weeklySalary: payout.weekly_salary_paid,
      salaryCurrency: payout.salary_currency,
      usdSales,
      crcSales,
      usdCommission: recalculated.usd_commission,
      crcCommission: recalculated.crc_commission,
      totalPayoutUsd: recalculated.total_payout_usd,
      totalPayoutCrc: recalculated.total_payout_crc,
      orders: reportedOrders,
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
        try {
          const subject = `Weekly Commissions Invoice - ${payout.agent_name || payout.agent_email} [${commissionRateLabel(commissionSummary.rates, payout.commission_rate)}]`;
          await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
            from: notificationFrom,
            to: payout.agent_email.trim(),
            cc: withTaxRecordsCc(ADMIN_CC_EMAILS),
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

    // 4. Update payout status to Approved.
    // The override columns are dropped if add-sub-user-override-to-payouts.sql
    // has not been run yet, so approving an ordinary staff payout keeps working
    // on a database that has never heard of sub-users.
    const { error: updateError, droppedColumns } = await writeDroppingMissingColumns(
      {
        status: 'Approved',
        usd_sales: usdSales,
        crc_sales: crcSales,
        usd_commission: recalculated.usd_commission,
        crc_commission: recalculated.crc_commission,
        total_payout_usd: recalculated.total_payout_usd,
        total_payout_crc: recalculated.total_payout_crc,
        // Stored decorated so the Team dashboard shows the same per-order rates
        // this email did, instead of falling back to the flat profile rate.
        orders_data: reportedOrders,
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
      },
      SUB_USER_PAYOUT_COLUMNS,
      (row) => supabaseAdmin.from('commission_payouts').update(row).eq('id', payoutId)
    );

    if (droppedColumns?.length) {
      console.warn(
        '[Commission Approval] Sub-user override columns missing, run add-sub-user-override-to-payouts.sql:',
        droppedColumns.join(', ')
      );
    }

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
