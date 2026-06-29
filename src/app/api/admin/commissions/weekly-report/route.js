import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  COMMISSION_ELIGIBLE_ORDER_STATUSES,
  getOrderSalesAmounts,
  orderBelongsToAgent,
} from '@/lib/agentOrders';
import { getPeriodLabel, recalcPayoutAmounts } from '@/lib/commissionPayouts';
import { buildAgentCommissionEmail } from '@/lib/commissionEmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Email Configuration from Environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'info@peptidescostarica.net'}>`;
const ADMIN_CC_EMAILS = process.env.COMMISSION_REPORT_ADMIN_EMAILS
  || 'info@peptidescostarica.net, omerforce@gmail.com';

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

    // 4. Only paid/completed orders earn commission. Pending and processing
    // orders remain outside the payout until a future completed-week scan.
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .gte('created_at', startDateStr)
      .lte('created_at', endDateStr)
      .in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES)
      .order('created_at', { ascending: false });

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
      },
      tls: {
        rejectUnauthorized: false
      }
    }) : null;

    // 5. Calculate weekly gross sales and commissions for each agent
    // First, get all already approved payout orders so we don't double count
    const { data: approvedPayouts } = await supabaseAdmin
      .from('commission_payouts')
      .select('orders_data')
      .eq('status', 'Approved');

    const paidOrderIds = new Set();
    if (approvedPayouts) {
      for (const p of approvedPayouts) {
        if (p.orders_data && Array.isArray(p.orders_data)) {
          for (const order of p.orders_data) {
            if (order && order.id) {
              paidOrderIds.add(order.id);
            }
          }
        }
      }
    }

    for (const agent of profiles) {
      // If a specific agent is targeted, skip other agents
      if (targetAgentEmail && agent.email?.trim().toLowerCase() !== targetAgentEmail.trim().toLowerCase()) {
        continue;
      }
      const rate = Number(agent.commission_rate || 0);
      const weeklySalary = Number(agent.weekly_salary || 0);
      const salaryCurrency = agent.salary_currency || 'USD';
      
      const agentOrders = (orders || [])
        .filter((order) => {
          if (paidOrderIds.has(order.id)) return false;
          return orderBelongsToAgent(order, agent);
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Ignore non-commission staff, but keep configured agents in the all-agent report
      // even when their result for the week is zero.
      if (agentOrders.length === 0 && weeklySalary === 0 && rate === 0) continue;

      // Group totals by currency
      let usdSales = 0;
      let crcSales = 0;

      for (const order of agentOrders) {
        const amounts = getOrderSalesAmounts(order);
        usdSales += amounts.usd;
        crcSales += amounts.crc;
      }

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
        weeklySalary,
        salaryCurrency,
      });

      // Individual report: Outlook-safe, light, and limited to this agent.
      const { html: emailHtml, text: emailText } = buildAgentCommissionEmail({
        agentName: agent.name || agent.email,
        periodDisplay,
        commissionRate: rate,
        weeklySalary,
        salaryCurrency,
        usdSales,
        crcSales,
        usdCommission,
        crcCommission,
        totalPayoutUsd,
        totalPayoutCrc,
        orders: agentOrders,
      });

      // 6. Save or update pending payout for this agent + period (dedupe duplicates)
      const { data: existingPayouts } = await supabaseAdmin
        .from('commission_payouts')
        .select('id')
        .eq('agent_email', agent.email)
        .eq('status', 'Pending')
        .eq('start_date', startDateStr)
        .eq('end_date', endDateStr)
        .order('created_at', { ascending: false });

      const primaryPayout = existingPayouts?.[0] || null;
      const duplicateIds = (existingPayouts || []).slice(1).map((p) => p.id);

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
        start_date: startDateStr,
        end_date: endDateStr,
        usd_sales: usdSales,
        crc_sales: crcSales,
        commission_rate: rate,
        usd_commission: usdCommission,
        crc_commission: crcCommission,
        weekly_salary_paid: weeklySalary,
        salary_currency: salaryCurrency,
        total_payout_usd: totalPayoutUsd,
        total_payout_crc: totalPayoutCrc,
        orders_data: agentOrders,
        email_html: emailHtml,
      };

      let saveError = null;
      if (primaryPayout) {
        const { error } = await supabaseAdmin
          .from('commission_payouts')
          .update(payoutPayload)
          .eq('id', primaryPayout.id);
        saveError = error;
      } else {
        const { error } = await supabaseAdmin
          .from('commission_payouts')
          .insert([{
            ...payoutPayload,
            agent_email: agent.email,
            status: 'Pending',
          }]);
        saveError = error;
      }

      let agentEmailSent = false;
      let agentEmailError = null;
      if (transporter && agent.email && !saveError) {
        try {
          await transporter.sendMail({
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

      reportResults.push({
        agentId: agent.id,
        name: agent.name,
        email: agent.email,
        rate: `${rate}%`,
        closedOrdersCount: agentOrders.length,
        usdSales: formatMoney(usdSales, 'USD'),
        crcSales: formatMoney(crcSales, 'CRC'),
        usdCommission: formatMoney(usdCommission, 'USD'),
        crcCommission: formatMoney(crcCommission, 'CRC'),
        totalPayoutUsd,
        totalPayoutCrc,
        agentEmailSent,
        agentEmailError,
        savedSuccessfully: !saveError,
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

    return NextResponse.json({
      success: true,
      period: {
        start: startDateStr,
        end: endDateStr,
        label: periodLabel,
        timeZone: 'America/Costa_Rica',
      },
      payoutReport: reportResults,
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
