import { NextResponse } from 'next/server';
import { withoutExcludedOrders } from '@/lib/orderRevenue.mjs';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  COMMISSION_ELIGIBLE_ORDER_STATUSES,
  getOrderSalesAmounts,
  orderBelongsToAgent,
} from '@/lib/agentOrders';
import { getPeriodLabel, recalcPayoutAmounts } from '@/lib/commissionPayouts';
import { applyCommissionAdjustments } from '@/lib/orderRefund.mjs';
import {
  buildPaidOrderIndex,
  computeOverrideAmounts,
  hasBeenPaid,
  overrideRateFor,
  payableChildrenOf,
} from '@/lib/subUserCommission.mjs';
import { isActiveProfile, profileTier } from '@/lib/subUserTier.mjs';
import { SUB_USER_PAYOUT_COLUMNS, writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { buildAgentCommissionEmail } from '@/lib/commissionEmail';
import {
  commissionRateLabel,
  decorateCommissionOrder,
  summarizeOrderCommissions,
} from '@/lib/orderCommission.mjs';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import { commissionSourceLabel } from '@/lib/salesAgentAffiliate.mjs';
import { getOrderMailSettings } from '@/lib/transactionalSmtp';
import { stripOwnerAddress } from '@/lib/orderEmailAddressing.mjs';
import { sendTaxRecordsPayoutCopy } from '@/lib/taxRecordsEmail.mjs';
import { hasPositivePayout, summarizeCommissionScan } from '@/lib/commissionScan.mjs';
import { PAYOUT_RESERVED_STATUSES } from '@/lib/payoutSettlement.mjs';
import { orderCompletedAtMs } from '@/lib/agentDashboard.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Email Configuration from Environment variables
// The owner is BCC'd on this mail, so they are stripped from the visible
// recipients rather than named twice on the same envelope.
const ADMIN_CC_EMAILS = stripOwnerAddress(
  process.env.COMMISSION_REPORT_ADMIN_EMAILS
    || 'info@peptidescostarica.net, omerforce@gmail.com'
);

const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₡${Math.round(amount).toLocaleString('en-US')}`;
};

const formatCrDate = (value, options = {}) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Costa_Rica',
  month: 'short',
  day: 'numeric',
  ...options,
}).format(new Date(value));

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export async function GET(request) {
  // Read at request time. Destructured at module scope, these froze whatever
  // process.env held when the route was first loaded, so a deployment built
  // before ORDER_SMTP_* existed skipped every send on an HTTP 200.
  const { smtp: mailSmtp, from: NOTIFICATION_FROM } = getOrderMailSettings();
  const { host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE, user: SMTP_USER, pass: SMTP_PASS } = mailSmtp;

  const authHeader = request.headers.get('authorization');
  const isCronRequest = Boolean(process.env.CRON_SECRET)
    && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCronRequest) {
    const auth = await verifyAdminSession(request, { requireSuperadmin: true });
    if (auth.error) return auth.error;
  }

  try {
    // 1. Initialize Supabase Admin Client
    const supabaseAdmin = getSupabaseAdmin();
    const { rate: currentExchangeRate } = await getDatabaseBackedUsdToCrcRate();

    // 2. Parse query parameters to support period selection
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'previous';
    const targetAgentEmail = searchParams.get('agentEmail');

    // 3. Calculate Monday-to-Sunday boundaries in Costa Rica Time (UTC-6)
    const CR_OFFSET = -6; // Costa Rica is UTC-6 all year
    const nowUTC = new Date();
    
    // Shift current time to Costa Rica timezone to correctly determine current "day"
    const nowCR = new Date(nowUTC.getTime() + (CR_OFFSET * 60 * 60 * 1000));
    const day = nowCR.getUTCDay();
    const dayOffset = day === 0 ? 7 : day; // Normalize so Monday is 1, Sunday is 7

    // Get current week's Monday at 00:00:00.000 in CR Time
    const currentMondayCR = new Date(nowCR);
    currentMondayCR.setUTCDate(nowCR.getUTCDate() - dayOffset + 1);
    currentMondayCR.setUTCHours(0, 0, 0, 0);

    let startDateCR, endDateCR;

    if (period === 'current') {
      startDateCR = currentMondayCR;
      endDateCR = nowCR; // Up to the current moment in CR
    } else if (period === 'all-time') {
      startDateCR = new Date('2020-01-01T00:00:00.000Z');
      endDateCR = nowCR; // All time until now
    } else if (period === 'custom') {
      const customStart = searchParams.get('start');
      const customEnd = searchParams.get('end');
      if (!customStart || !customEnd) {
        return NextResponse.json({ error: 'Start and end dates are required for custom period' }, { status: 400 });
      }
      startDateCR = new Date(`${customStart}T00:00:00.000Z`);
      endDateCR = new Date(`${customEnd}T23:59:59.999Z`);
    } else {
      // previous complete week
      const prevMondayCR = new Date(currentMondayCR);
      prevMondayCR.setUTCDate(currentMondayCR.getUTCDate() - 7);

      const prevSundayCR = new Date(prevMondayCR);
      prevSundayCR.setUTCDate(prevMondayCR.getUTCDate() + 6);
      prevSundayCR.setUTCHours(23, 59, 59, 999);

      startDateCR = prevMondayCR;
      endDateCR = prevSundayCR;
    }

    // Convert back to true UTC for accurate database querying
    const startDate = new Date(startDateCR.getTime() - (CR_OFFSET * 60 * 60 * 1000));
    const endDate = new Date(endDateCR.getTime() - (CR_OFFSET * 60 * 60 * 1000));

    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();
    const periodLabel = getPeriodLabel(
      period,
      searchParams.get('start'),
      searchParams.get('end')
    );
    const periodDisplay = `${formatCrDate(startDateStr)} – ${formatCrDate(endDateStr, { year: 'numeric' })}`;

    // 4. Fetch completed orders, then date them by the first completion event.
    // This ensures an order created or paid earlier lands in the week it was
    // actually closed, matching the completed-only revenue rule.
    const { data: rawOrders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES)
      .order('created_at', { ascending: false });

    const orders = withoutExcludedOrders(rawOrders || []).filter(order => {
      const completedAt = orderCompletedAtMs(order);
      return Number.isFinite(completedAt)
        && completedAt >= startDate.getTime()
        && completedAt <= endDate.getTime();
    });

    if (ordersError) {
      console.error('Error fetching orders for weekly commissions:', ordersError);
      return NextResponse.json({ error: 'Failed to fetch weekly orders' }, { status: 500 });
    }

    // 4. Fetch all admin profiles with their commission rates
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('admin_profiles')
      .select('*');

    if (profilesError) {
      console.error('Error fetching admin profiles:', profilesError);
      return NextResponse.json({ error: 'Failed to fetch agent profiles' }, { status: 500 });
    }

    const reportResults = [];
    const skippedNoPay = [];

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.warn('[Weekly Commissions] SMTP credentials missing. Skipping email dispatch.');
    }

    const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASS) ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      }
    }) : null;

    // 5. Calculate weekly gross sales and commissions for each agent
    // First, get all already approved payout orders so we don't double count.
    // The index is keyed PER AGENT, not by order id alone: a sub-user's order
    // legitimately pays two people (their 8% and their parent's 2% override), so
    // one order can be settled for one person and still outstanding for another.
    // A flat set of order ids would make approving the sub-user's payout first
    // silently erase the parent's override on the next scan.
    const { data: approvedPayouts } = await supabaseAdmin
      .from('commission_payouts')
      .select('agent_email, orders_data, override_orders_data, start_date, end_date')
      .in('status', PAYOUT_RESERVED_STATUSES);

    // Re-running a period has to reproduce it. Orders settled by THIS period's
    // own approved payout are left out of the guard, or the second scan reports
    // a week that really earned money as near-zero and mails that to the agent
    // and the accountant. Earlier periods stay excluded, which is the actual
    // double-payment this index prevents.
    const paidIndex = buildPaidOrderIndex(approvedPayouts || [], {
      excludePeriod: { startDate: startDateStr, endDate: endDateStr },
    });

    // Pending and suspended people earn nothing at all — approval is the gate on
    // money, not just on login. An unapproved invite therefore costs nothing.
    const payableProfiles = (profiles || []).filter(isActiveProfile);

    for (const agent of payableProfiles) {
      // If a specific agent is targeted, skip other agents
      if (targetAgentEmail && agent.email?.trim().toLowerCase() !== targetAgentEmail.trim().toLowerCase()) {
        continue;
      }
      const rate = Number(agent.commission_rate || 0);
      const weeklySalary = Number(agent.weekly_salary || 0);
      const salaryCurrency = agent.salary_currency || 'USD';
      
      const agentOrders = (orders || [])
        .filter((order) => {
          if (hasBeenPaid(paidIndex, agent.email, order.id)) return false;
          return orderBelongsToAgent(order, agent);
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // The 2% override: this agent's cut of orders her sub-users brought in.
      // Their orders carry the sub-user's name as sales_agent, so they are never
      // matched by orderBelongsToAgent above — which is exactly why a staff
      // member cannot earn both her own rate and the override on one order.
      const overrideRate = overrideRateFor(agent);
      const children = payableChildrenOf(agent, payableProfiles);

      // Broken down per person, so her statement can answer "why is my number
      // this?" without anyone having to reopen the dashboard.
      const overrideOrders = [];
      const overrideBreakdown = [];
      let overrideSalesUsd = 0;
      let overrideSalesCrc = 0;

      for (const child of children) {
        const childOrders = (orders || []).filter((order) => {
          if (hasBeenPaid(paidIndex, agent.email, order.id)) return false;
          return orderBelongsToAgent(order, child);
        });
        if (childOrders.length === 0) continue;

        let childUsd = 0;
        let childCrc = 0;
        for (const order of childOrders) {
          const amounts = getOrderSalesAmounts(order, currentExchangeRate);
          childUsd += amounts.usd;
          childCrc += amounts.crc;
        }

        const childShare = computeOverrideAmounts({
          usdSales: childUsd,
          crcSales: childCrc,
          overrideRate,
        });

        overrideOrders.push(...childOrders);
        overrideSalesUsd += childUsd;
        overrideSalesCrc += childCrc;
        overrideBreakdown.push({
          name: child.name || child.email,
          ordersCount: childOrders.length,
          salesUsd: childUsd,
          salesCrc: childCrc,
          overrideUsd: childShare.overrideUsd,
          overrideCrc: childShare.overrideCrc,
        });
      }

      overrideOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const { overrideUsd, overrideCrc } = computeOverrideAmounts({
        usdSales: overrideSalesUsd,
        crcSales: overrideSalesCrc,
        overrideRate,
      });

      const commissionSummary = summarizeOrderCommissions(
        agentOrders,
        rate,
        (order) => getOrderSalesAmounts(order, currentExchangeRate)
      );
      const usdSales = commissionSummary.usdSales;
      const crcSales = commissionSummary.crcSales;
      const agentRateLabel = commissionRateLabel(commissionSummary.rates, rate);
      const reportedAgentOrders = agentOrders.map((order) => decorateCommissionOrder(
        order,
        rate,
        (row) => getOrderSalesAmounts(row, currentExchangeRate),
        commissionSourceLabel
      ));

      // Calculate commissions
      const {
        usd_commission: usdCommission,
        crc_commission: crcCommission,
        total_payout_usd: totalPayoutUsd,
        total_payout_crc: totalPayoutCrc,
      } = recalcPayoutAmounts({
        usdSales,
        crcSales,
        commissionRate: rate,
        usdCommissionOverride: commissionSummary.usdCommission,
        crcCommissionOverride: commissionSummary.crcCommission,
        weeklySalary,
        salaryCurrency,
        exchangeRate: currentExchangeRate,
        overrideUsd,
        overrideCrc,
      });

      // Commission already paid on an order that was later refunded comes off
      // this week's pay. Applied to the total rather than to the commission
      // line so a refund can also eat into salary — the debt is a debt, not a
      // discount on one component. Never takes the pay below zero: whatever
      // this week cannot cover waits for the next one.
      const { data: openDebts } = await supabaseAdmin
        .from('commission_adjustments')
        .select('*')
        .eq('agent_email', agent.email)
        .is('settled_at', null);

      const adjusted = applyCommissionAdjustments(totalPayoutUsd, totalPayoutCrc, openDebts || []);

      // A commission rate is configuration, not money owed. The old scan made
      // Pending $0 rows for every configured agent with no sales, which is why
      // a rerun appeared to contain only Brian and Sean. Remove stale Pending
      // zero rows for this exact period and keep them out of reports and email.
      if (!hasPositivePayout({ totalPayoutUsd, totalPayoutCrc })) {
        const { data: rejectedRows, error: rejectError } = await supabaseAdmin
          .from('commission_payouts')
          .update({ status: 'Rejected', approved_at: new Date().toISOString() })
          .eq('agent_email', agent.email)
          .eq('start_date', startDateStr)
          .eq('end_date', endDateStr)
          .eq('status', 'Pending')
          .select('id');

        skippedNoPay.push({
          name: agent.name || agent.email,
          email: agent.email,
          rejectedPendingRows: rejectedRows?.length || 0,
          cleanupError: rejectError?.message || null,
        });
        continue;
      }

      // Individual report: Outlook-safe, light, and limited to this agent.
      const { html: emailHtml, text: emailText } = buildAgentCommissionEmail({
        agentName: agent.name || agent.email,
        periodDisplay,
        commissionRate: agentRateLabel,
        weeklySalary,
        salaryCurrency,
        usdSales,
        crcSales,
        usdCommission,
        crcCommission,
        totalPayoutUsd,
        totalPayoutCrc,
        orders: reportedAgentOrders,
        overrideRate,
        overrideUsd,
        overrideCrc,
        overrideBreakdown,
      });

      // 6. Save or update pending payout for this agent + period (dedupe duplicates)
      // Every status is read, not just Pending: an approved payout for this
      // period used to be invisible here, so a second scan inserted a *fresh*
      // Pending row beside the settled one and the week looked owed twice.
      const { data: existingPayouts } = await supabaseAdmin
        .from('commission_payouts')
        .select('id, status')
        .eq('agent_email', agent.email)
        .eq('start_date', startDateStr)
        .eq('end_date', endDateStr)
        .order('created_at', { ascending: false });

      const settledPayout = (existingPayouts || []).find((p) => PAYOUT_RESERVED_STATUSES.includes(p.status)) || null;
      const pendingPayouts = (existingPayouts || []).filter((p) => p.status === 'Pending');
      const primaryPayout = pendingPayouts[0] || null;
      const duplicateIds = pendingPayouts.slice(1).map((p) => p.id);

      if (duplicateIds.length > 0) {
        await supabaseAdmin
          .from('commission_payouts')
          .update({
            status: 'Rejected',
            approved_at: new Date().toISOString(),
          })
          .in('id', duplicateIds);
      }

      const payoutPayload = {
        agent_id: agent.user_id || null,
        agent_name: agent.name || null,
        agent_tier: profileTier(agent),
        start_date: startDateStr,
        end_date: endDateStr,
        usd_sales: usdSales,
        crc_sales: crcSales,
        commission_rate: rate,
        usd_commission: usdCommission,
        crc_commission: crcCommission,
        weekly_salary_paid: weeklySalary,
        salary_currency: salaryCurrency,
        // What is actually payable after refund clawbacks. Floored at zero by
        // applyCommissionAdjustments — a payslip is never negative.
        total_payout_usd: adjusted.payableUsd,
        total_payout_crc: adjusted.payableCrc,
        adjustment_usd: adjusted.deductedUsd,
        adjustment_crc: adjusted.deductedCrc,
        // Named orders, so a short payslip explains itself instead of the agent
        // having to ask why.
        adjustments_data: adjusted.applied,
        adjustment_carried_usd: adjusted.carriedUsd,
        adjustment_carried_crc: adjusted.carriedCrc,
        orders_data: reportedAgentOrders,
        // Kept separate from orders_data so approving this payout marks these
        // orders paid for THIS agent only, leaving the sub-user's own 8% intact.
        override_rate: overrideRate,
        override_usd: overrideUsd,
        override_crc: overrideCrc,
        override_sales_usd: overrideSalesUsd,
        override_sales_crc: overrideSalesCrc,
        override_orders_data: overrideOrders,
        email_html: emailHtml,
      };

      // The override columns arrive with add-sub-user-override-to-payouts.sql.
      // Until that is run they are dropped rather than failing the write, so a
      // deploy that lands before the SQL cannot take down the weekly scan for
      // staff whose commissions have nothing to do with sub-users.
      let saveError = null;
      let droppedColumns = null;

      // An approved payout is settled money. Re-running the scan re-sends the
      // report — which is the point of running it again — but must not rewrite
      // or duplicate the row the accountant has already paid against.
      if (settledPayout) {
        console.log(`[Weekly Commissions] ${agent.email} already has an approved payout for ${periodDisplay}; re-sending the report without writing.`);
      } else {
        const { error: writeError, droppedColumns: dropped } = await writeDroppingMissingColumns(
          primaryPayout
            ? payoutPayload
            : { ...payoutPayload, agent_email: agent.email, status: 'Pending' },
          SUB_USER_PAYOUT_COLUMNS,
          (row) => (primaryPayout
            ? supabaseAdmin.from('commission_payouts').update(row).eq('id', primaryPayout.id)
            : supabaseAdmin.from('commission_payouts').insert([row]))
        );
        saveError = writeError;
        droppedColumns = dropped;
      }

      if (droppedColumns?.length) {
        console.warn(
          '[Weekly Commissions] Sub-user override columns missing, run add-sub-user-override-to-payouts.sql:',
          droppedColumns.join(', ')
        );
      }

      let agentEmailSent = false;
      let agentEmailError = null;
      if (transporter && agent.email && !saveError) {
        try {
          await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
            from: NOTIFICATION_FROM,
            to: agent.email,
            subject: `Your weekly pay report · ${periodDisplay}`,
            html: emailHtml,
            text: emailText,
          });
          agentEmailSent = true;
        } catch (mailErr) {
          console.error(`[Weekly Commissions] Failed to email ${agent.email}:`, mailErr);
          agentEmailError = mailErr.message;
        }
      }

      // Approval is what makes a payout an accounting record. When an already
      // approved week is scanned again, resend a dedicated copy directly to
      // the accounting inbox; merely rebuilding the report used to send only
      // the admin summary and leave PBAG with nothing.
      const accountingCopy = settledPayout
        ? await sendTaxRecordsPayoutCopy({
          transporter,
          from: NOTIFICATION_FROM,
          payout: {
            kind: 'comisión de equipo',
            name: agent.name || agent.email,
            email: agent.email,
            period: periodDisplay,
          },
          html: emailHtml,
          text: emailText,
          logPrefix: `[Weekly Commissions] ${agent.email}`,
        })
        : { sent: false, skipped: 'not-approved' };

      reportResults.push({
        agentId: agent.id,
        name: agent.name,
        email: agent.email,
        rate: agentRateLabel,
        closedOrdersCount: agentOrders.length,
        usdSales: formatMoney(usdSales, 'USD'),
        crcSales: formatMoney(crcSales, 'CRC'),
        usdCommission: formatMoney(usdCommission, 'USD'),
        crcCommission: formatMoney(crcCommission, 'CRC'),
        tier: profileTier(agent),
        overrideRate: `${overrideRate}%`,
        overrideOrdersCount: overrideOrders.length,
        overrideUsd: formatMoney(overrideUsd, 'USD'),
        overrideCrc: formatMoney(overrideCrc, 'CRC'),
        overrideBreakdown,
        totalPayoutUsd,
        totalPayoutCrc,
        agentEmailSent,
        agentEmailError,
        accountingCopy,
        savedSuccessfully: !saveError,
        alreadySettled: Boolean(settledPayout),
        saveError: saveError ? saveError.message : null
      });
    }

    let adminEmailSent = false;
    let adminEmailError = null;

    // 7. Send notification email to admins
    if (transporter && reportResults.length > 0) {
      try {
        const adminEmailHtml = `
          <div style="background:#f1f5f9;padding:24px 12px;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;background:#ffffff;max-width:680px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <div style="background:#0f172a;padding:28px 24px;text-align:center;">
              <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="96" height="81" style="display:block;width:96px;height:81px;margin:0 auto 14px auto;border:0;outline:none;text-decoration:none;border-radius:10px;">
              <div style="color:#ffffff;font-size:19px;font-weight:800;letter-spacing:.7px;">PEPTIDES COSTA RICA</div>
              <h1 style="color:#ffffff;font-size:24px;margin:14px 0 6px;">Weekly team pay report</h1>
              <p style="color:#cbd5e1;font-size:13px;margin:0;">${periodDisplay} · Costa Rica time</p>
            </div>
            <div style="padding:26px 24px;">
              <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">Reports are ready for ${reportResults.length} agent${reportResults.length === 1 ? '' : 's'}. Each row shows one payout in two equivalent currencies; the USD and CRC figures are alternatives, not amounts to add together.</p>
            <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:#f8fafc;text-align:left;">
                    <th style="padding:11px 10px;font-size:10px;color:#64748b;text-transform:uppercase;">Agent</th>
                    <th style="padding:11px 10px;font-size:10px;text-align:center;color:#64748b;text-transform:uppercase;">Orders</th>
                    <th style="padding:11px 10px;font-size:10px;text-align:right;color:#64748b;text-transform:uppercase;">Total payout</th>
                  </tr>
                </thead>
                <tbody>
                  ${reportResults.map(r => `
                    <tr>
                      <td style="padding:13px 10px;border-top:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(r.name || r.email)}</td>
                      <td style="padding:13px 10px;border-top:1px solid #e2e8f0;font-size:13px;text-align:center;color:#475569;">${r.closedOrdersCount}</td>
                      <td style="padding:13px 10px;border-top:1px solid #e2e8f0;font-size:13px;text-align:right;font-weight:800;color:#0f172a;white-space:nowrap;">
                        ${formatMoney(r.totalPayoutUsd, 'USD')}<br>
                        <span style="font-size:10px;color:#64748b;text-transform:uppercase;">or</span><br>
                        ${formatMoney(r.totalPayoutCrc, 'CRC')}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div style="text-align:center;margin-bottom:24px;">
              <a href="https://peptidescostarica.net/admin?tab=team" style="display:inline-block;background:#0f766e;color:#ffffff;font-weight:bold;padding:13px 24px;border-radius:9px;text-decoration:none;font-size:13px;">
                Review & Approve Payouts
              </a>
            </div>
            <div style="border-top:1px solid #e2e8f0;padding-top:16px;text-align:center;font-size:11px;color:#94a3b8;">
              Automated weekly report · Peptides Costa Rica
            </div>
            </div>
          </div>
          </div>
        `;

        await transporter.sendMail({
          bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
          from: NOTIFICATION_FROM,
          to: ADMIN_CC_EMAILS,
          subject: `Weekly team pay report · ${periodDisplay}`,
          html: adminEmailHtml,
          text: `Weekly team pay report for ${periodDisplay}\n\n${reportResults.map(r => `${r.name || r.email}: ${formatMoney(r.totalPayoutUsd, 'USD')} OR ${formatMoney(r.totalPayoutCrc, 'CRC')}`).join('\n')}\n\nEach pair is one payout expressed in two currencies. Choose one—not both.`
        });
        adminEmailSent = true;
      } catch (mailErr) {
        console.error('[Weekly Commissions] Failed to notify admins:', mailErr);
        adminEmailError = mailErr.message;
      }
    }

    const summary = summarizeCommissionScan(reportResults, skippedNoPay);

    return NextResponse.json({
      success: true,
      period: {
        start: startDateStr,
        end: endDateStr,
        label: periodLabel,
        timeZone: 'America/Costa_Rica',
      },
      payoutReport: reportResults,
      skippedNoPay,
      summary,
      adminNotification: {
        emailSent: adminEmailSent,
        error: adminEmailError
      }
    });

  } catch (err) {
    console.error('[Weekly Commissions] Critical script crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
