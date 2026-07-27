import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';

// Email Configuration from Environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'omerforce@gmail.com'}>`;
const ADMIN_CC_EMAILS = 'info@peptidescostarica.net, omerforce@gmail.com';

const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₡${Math.round(amount).toLocaleString('en-US')}`;
};

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'previous';
    const targetAffiliateId = searchParams.get('affiliateId');

    // Calculate dates in Costa Rica Time (UTC-6)
    const CR_OFFSET = -6;
    const nowUTC = new Date();
    const nowCR = new Date(nowUTC.getTime() + (CR_OFFSET * 60 * 60 * 1000));
    const day = nowCR.getUTCDay();
    const dayOffset = day === 0 ? 7 : day;

    const currentMondayCR = new Date(nowCR);
    currentMondayCR.setUTCDate(nowCR.getUTCDate() - dayOffset + 1);
    currentMondayCR.setUTCHours(0, 0, 0, 0);

    let startDateCR, endDateCR;

    if (period === 'current') {
      startDateCR = currentMondayCR;
      endDateCR = nowCR;
    } else if (period === 'all-time') {
      startDateCR = new Date('2020-01-01T00:00:00.000Z');
      endDateCR = nowCR;
    } else if (period === 'custom') {
      const customStart = searchParams.get('start');
      const customEnd = searchParams.get('end');
      if (!customStart || !customEnd) {
        return NextResponse.json({ error: 'Start and end dates are required for custom period' }, { status: 400 });
      }
      startDateCR = new Date(`${customStart}T00:00:00.000Z`);
      endDateCR = new Date(`${customEnd}T23:59:59.999Z`);
    } else {
      // previous week
      const prevMondayCR = new Date(currentMondayCR);
      prevMondayCR.setUTCDate(currentMondayCR.getUTCDate() - 7);

      const prevSundayCR = new Date(prevMondayCR);
      prevSundayCR.setUTCDate(prevMondayCR.getUTCDate() + 6);
      prevSundayCR.setUTCHours(23, 59, 59, 999);

      startDateCR = prevMondayCR;
      endDateCR = prevSundayCR;
    }

    const startDate = new Date(startDateCR.getTime() - (CR_OFFSET * 60 * 60 * 1000));
    const endDate = new Date(endDateCR.getTime() - (CR_OFFSET * 60 * 60 * 1000));

    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();

    // Fetch all non-cancelled orders with an affiliate ID in the scanned period
    let query = supabaseAdmin
      .from('orders')
      .select('*')
      .gte('created_at', startDateStr)
      .lte('created_at', endDateStr)
      .not('status', 'eq', 'Cancelled')
      .not('affiliate_id', 'is', null);

    if (targetAffiliateId) {
      query = query.eq('affiliate_id', targetAffiliateId);
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      console.error('Error fetching affiliate orders:', ordersError);
      return NextResponse.json({ error: 'Failed to fetch weekly orders' }, { status: 500 });
    }

    // Fetch affiliates
    let affiliateQuery = supabaseAdmin.from('affiliates').select('*');
    if (targetAffiliateId) {
      affiliateQuery = affiliateQuery.eq('id', targetAffiliateId);
    }
    const { data: affiliates, error: affiliatesError } = await affiliateQuery;

    if (affiliatesError) {
      console.error('Error fetching affiliates:', affiliatesError);
      return NextResponse.json({ error: 'Failed to fetch affiliates list' }, { status: 500 });
    }

    // Fetch already approved payouts to exclude paid orders
    const { data: approvedPayouts } = await supabaseAdmin
      .from('affiliate_payouts')
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

    const reportResults = [];
    const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASS) ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    }) : null;

    for (const aff of affiliates) {
      const rate = Number(aff.commission_rate || 0.10);

      // Filter orders for this affiliate
      const affOrders = (orders || []).filter(order => {
        if (paidOrderIds.has(order.id)) return false;
        return order.affiliate_id === aff.id;
      });

      if (affOrders.length === 0) continue;

      let usdSales = 0;
      let crcSales = 0;
      let usdCommission = 0;
      let crcCommission = 0;

      for (const order of affOrders) {
        const totalAmount = Number(order.total || 0);
        if (order.currency === 'USD') {
          usdSales += totalAmount;
        } else {
          crcSales += totalAmount;
        }
        usdCommission += Number(order.affiliate_commission_usd || 0);
        crcCommission += Number(order.affiliate_commission_crc || 0);
      }

      // Build HTML invoice
      const ordersTableRows = affOrders.map(order => {
        const date = new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `
          <tr>
            <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;color:#e2e8f0;font-family:monospace;font-weight:bold;">
              #${order.order_number || order.id.slice(0, 8)}
            </td>
            <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;color:#94a3b8;">
              ${date}
            </td>
            <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;color:#cbd5e1;font-weight:bold;">
              ${order.promo_code || 'N/A'}
            </td>
            <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;text-align:right;color:#f8fafc;font-weight:bold;">
              ${formatMoney(order.total, order.currency)}
            </td>
          </tr>
        `;
      }).join('');

      const emailHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;background:#0b0f19;max-width:640px;margin:0 auto;padding:32px 24px;border:1px solid rgba(255,255,255,0.08);border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="96" height="81" style="display:block;width:96px;height:81px;margin:0 auto 14px auto;border:0;outline:none;text-decoration:none;border-radius:10px;">
            <h1 style="color:#ffffff;font-size:20px;font-weight:800;margin:0 0 6px;letter-spacing:-0.5px;">Weekly Affiliate Commission Invoice</h1>
            <p style="color:#94a3b8;font-size:13px;margin:0;">Invoice Period: ${new Date(startDateStr).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} to ${new Date(endDateStr).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</p>
          </div>

          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
            <p style="margin:0 0 4px;font-size:14px;color:#94a3b8;">Affiliate Partner</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:800;color:#38bdf8;">${aff.name}</p>
            <div style="border-top:1px dashed rgba(255,255,255,0.08);margin-bottom:16px;"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:center;">
              <div>
                <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;">Gross USD Referrals</p>
                <p style="margin:0;font-size:20px;font-weight:900;color:#f8fafc;">${formatMoney(usdSales, 'USD')}</p>
              </div>
              <div>
                <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;">Gross CRC Referrals</p>
                <p style="margin:0;font-size:20px;font-weight:900;color:#f8fafc;">${formatMoney(crcSales, 'CRC')}</p>
              </div>
            </div>
          </div>

          <div style="background:linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(168, 85, 247, 0.05) 100%);border:1px solid rgba(56, 189, 248, 0.3);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
            <span style="font-size:12px;font-weight:bold;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;background:rgba(56, 189, 248, 0.1);padding:4px 10px;border-radius:12px;">Commission Rate: ${(rate * 100).toFixed(0)}%</span>
            <h2 style="font-size:15px;color:#e2e8f0;margin:16px 0 8px;font-weight:600;">Total Affiliate Commission Owed</h2>
            <div style="font-size:26px;font-weight:950;color:#ffffff;line-height:1.2;margin:0 0 4px 0;">
              ${usdCommission > 0 ? `${formatMoney(usdCommission, 'USD')}` : ''}
              ${usdCommission > 0 && crcCommission > 0 ? ' + ' : ''}
              ${crcCommission > 0 ? `${formatMoney(crcCommission, 'CRC')}` : ''}
              ${usdCommission === 0 && crcCommission === 0 ? '$0.00' : ''}
            </div>
            <p style="margin:0;font-size:12px;color:#64748b;">This payout will be sent via your registered method shortly.</p>
          </div>

          <h3 style="font-size:13px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Referral Orders History</h3>
          <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.05);border-radius:12px;overflow:hidden;margin-bottom:24px;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.05);">
                  <th style="padding:12px;font-size:11px;font-weight:bold;text-align:left;color:#94a3b8;text-transform:uppercase;">Order #</th>
                  <th style="padding:12px;font-size:11px;font-weight:bold;text-align:left;color:#94a3b8;text-transform:uppercase;">Date</th>
                  <th style="padding:12px;font-size:11px;font-weight:bold;text-align:left;color:#94a3b8;text-transform:uppercase;">Promo Code</th>
                  <th style="padding:12px;font-size:11px;font-weight:bold;text-align:right;color:#94a3b8;text-transform:uppercase;">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                ${ordersTableRows}
              </tbody>
            </table>
          </div>

          <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px;text-align:center;font-size:11px;color:#64748b;">
            Peptides Costa Rica Affiliate Partners System
          </div>
        </div>
      `;

      // Save to affiliate_payouts
      const { data: existingPayout } = await supabaseAdmin
        .from('affiliate_payouts')
        .select('*')
        .eq('affiliate_id', aff.id)
        .eq('status', 'Pending')
        .maybeSingle();

      let saveError = null;
      if (existingPayout) {
        const { error } = await supabaseAdmin
          .from('affiliate_payouts')
          .update({
            affiliate_name: aff.name,
            affiliate_email: aff.email,
            start_date: startDateStr,
            end_date: endDateStr,
            usd_sales: usdSales,
            crc_sales: crcSales,
            commission_rate: rate * 100, // format like agent (as integer percentage, e.g. 10)
            usd_commission: usdCommission,
            crc_commission: crcCommission,
            orders_data: affOrders,
            email_html: emailHtml
          })
          .eq('id', existingPayout.id);
        saveError = error;
      } else {
        const { error } = await supabaseAdmin
          .from('affiliate_payouts')
          .insert([{
            affiliate_id: aff.id,
            affiliate_email: aff.email,
            affiliate_name: aff.name,
            start_date: startDateStr,
            end_date: endDateStr,
            usd_sales: usdSales,
            crc_sales: crcSales,
            commission_rate: rate * 100,
            usd_commission: usdCommission,
            crc_commission: crcCommission,
            status: 'Pending',
            orders_data: affOrders,
            email_html: emailHtml
          }]);
        saveError = error;
      }

      reportResults.push({
        affiliateId: aff.id,
        name: aff.name,
        email: aff.email,
        rate: `${(rate * 100).toFixed(0)}%`,
        closedOrdersCount: affOrders.length,
        usdSales: formatMoney(usdSales, 'USD'),
        crcSales: formatMoney(crcSales, 'CRC'),
        usdCommission: formatMoney(usdCommission, 'USD'),
        crcCommission: formatMoney(crcCommission, 'CRC'),
        savedSuccessfully: !saveError,
        saveError: saveError ? saveError.message : null
      });
    }

    let adminEmailSent = false;
    let adminEmailError = null;

    if (transporter && reportResults.length > 0) {
      try {
        const adminEmailHtml = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;background:#0b0f19;max-width:640px;margin:0 auto;padding:32px 24px;border:1px solid rgba(255,255,255,0.08);border-radius:16px;">
            <div style="text-align:center;margin-bottom:24px;">
              <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="96" height="81" style="display:block;width:96px;height:81px;margin:0 auto 14px auto;border:0;outline:none;text-decoration:none;border-radius:10px;">
              <h1 style="color:#ffffff;font-size:20px;font-weight:800;margin:0 0 6px;letter-spacing:-0.5px;">Pending Affiliate Payouts Action Required</h1>
              <p style="color:#94a3b8;font-size:13px;margin:0;">Weekly affiliate commission calculations are complete and awaiting admin approval.</p>
            </div>

            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:20px;margin-bottom:24px;">
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.08);text-align:left;">
                    <th style="padding:10px;font-size:11px;font-weight:bold;color:#94a3b8;text-transform:uppercase;">Affiliate Partner</th>
                    <th style="padding:10px;font-size:11px;font-weight:bold;text-align:center;color:#94a3b8;text-transform:uppercase;">Referrals</th>
                    <th style="padding:10px;font-size:11px;font-weight:bold;text-align:right;color:#94a3b8;text-transform:uppercase;">Pending Payout</th>
                  </tr>
                </thead>
                <tbody>
                  ${reportResults.map(r => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                      <td style="padding:12px 10px;font-size:13px;font-weight:bold;color:#f8fafc;">${r.name || r.email}</td>
                      <td style="padding:12px 10px;font-size:13px;text-align:center;color:#cbd5e1;">${r.closedOrdersCount}</td>
                      <td style="padding:12px 10px;font-size:13px;text-align:right;font-weight:bold;color:#38bdf8;">
                        ${r.usdCommission !== '$0.00' ? r.usdCommission : ''}
                        ${r.usdCommission !== '$0.00' && r.crcCommission !== '₡0' ? ' + ' : ''}
                        ${r.crcCommission !== '₡0' ? r.crcCommission : ''}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div style="text-align:center;margin-bottom:24px;">
              <a href="https://peptidescostarica.net/admin?tab=affiliates" style="display:inline-block;background:#38bdf8;color:#0b0f19;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:13px;">
                Review & Approve Affiliate Payouts
              </a>
            </div>

            <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px;text-align:center;font-size:11px;color:#64748b;">
              Peptides Costa Rica Administrative Automated CRM · Affiliate Partners Ledger
            </div>
          </div>
        `;

        await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
          from: NOTIFICATION_FROM,
          to: ADMIN_CC_EMAILS,
          subject: `🧬 [Action Required] Weekly Affiliate Payouts Pending Approval (${reportResults.length} Partners)`,
          html: adminEmailHtml,
          text: `Weekly affiliate reports are generated and pending approval for: ${reportResults.map(r => `${r.name || r.email} (Payout: ${r.usdCommission} + ${r.crcCommission})`).join(', ')}`
        });
        adminEmailSent = true;
      } catch (mailErr) {
        console.error('[Affiliate Weekly Commissions] Failed to notify admins:', mailErr);
        adminEmailError = mailErr.message;
      }
    }

    return NextResponse.json({
      success: true,
      period: { start: startDateStr, end: endDateStr },
      payoutReport: reportResults,
      adminNotification: { emailSent: adminEmailSent, error: adminEmailError }
    });

  } catch (err) {
    console.error('[Affiliate Weekly Commissions] Critical script crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
