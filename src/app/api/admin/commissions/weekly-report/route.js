import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';

// Email Configuration from Environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'info@peptidescostarica.net'}>`;
const ADMIN_CC_EMAILS = 'info@peptidescostarica.net, omerforce@gmail.com';

const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₡${Math.round(amount).toLocaleString('en-US')}`;
};

export async function GET(request) {
  try {
    // 1. Initialize Supabase Admin Client
    const supabaseAdmin = getSupabaseAdmin();

    // 2. Parse query parameters to support period selection
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'previous';

    // 3. Calculate Monday-to-Sunday boundaries
    const now = new Date();
    const day = now.getDay();
    const dayOffset = day === 0 ? 7 : day; // Normalize so Monday is 1, Sunday is 7

    // Get current week's Monday at 00:00:00.000 local time
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - dayOffset + 1);
    currentMonday.setHours(0, 0, 0, 0);

    let startDate, endDate;

    if (period === 'current') {
      startDate = currentMonday;
      endDate = new Date(); // Up to the current moment
    } else {
      // previous complete week
      const prevMonday = new Date(currentMonday);
      prevMonday.setDate(currentMonday.getDate() - 7);

      const prevSunday = new Date(prevMonday);
      prevSunday.setDate(prevMonday.getDate() + 6);
      prevSunday.setHours(23, 59, 59, 999);

      startDate = prevMonday;
      endDate = prevSunday;
    }

    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();

    // 4. Fetch all non-cancelled orders completed in the scanned period
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .gte('created_at', startDateStr)
      .lte('created_at', endDateStr)
      .not('status', 'eq', 'Cancelled');

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
    for (const agent of profiles) {
      const rate = Number(agent.commission_rate || 0);
      
      // Filter orders assigned to this agent (comparing against name or email dynamically)
      const agentOrders = (orders || []).filter(order => {
        const orderAgent = String(order.sales_agent || '').trim().toLowerCase();
        const agentName = String(agent.name || '').trim().toLowerCase();
        const agentEmail = String(agent.email || '').trim().toLowerCase();
        
        return orderAgent && (orderAgent === agentName || orderAgent === agentEmail);
      });

      // Skip agents with zero closed orders this week
      if (agentOrders.length === 0) continue;

      // Group totals by currency
      let usdSales = 0;
      let crcSales = 0;

      for (const order of agentOrders) {
        const totalAmount = Number(order.total || 0);
        if (order.currency === 'USD') {
          usdSales += totalAmount;
        } else {
          crcSales += totalAmount;
        }
      }

      // Calculate commissions
      const usdCommission = usdSales * (rate / 100);
      const crcCommission = crcSales * (rate / 100);

      // Build items table in HTML for this agent's invoice
      const ordersTableRows = agentOrders.map(order => {
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
              ${order.customer_name || 'N/A'}
            </td>
            <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;text-align:right;color:#f8fafc;font-weight:bold;">
              ${formatMoney(order.total, order.currency)}
            </td>
          </tr>
        `;
      }).join('');

      // Build premium HTML Email template with science design aesthetics
      const emailHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;background:#0b0f19;max-width:640px;margin:0 auto;padding:32px 24px;border:1px solid rgba(255,255,255,0.08);border-radius:16px;">
          <!-- Header Logo/Branding -->
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;padding:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:12px;">
              <span style="font-size:24px;font-weight:bold;color:#f8fafc;letter-spacing:1px;">🧬 PEPTIDES COSTA RICA</span>
            </div>
            <h1 style="color:#ffffff;font-size:20px;font-weight:800;margin:0 0 6px;letter-spacing:-0.5px;">Weekly Sales Commission Invoice</h1>
            <p style="color:#94a3b8;font-size:13px;margin:0;">Invoice Period: ${new Date(startDateStr).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} to ${new Date(endDateStr).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</p>
          </div>

          <!-- Greeting Card -->
          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
            <p style="margin:0 0 4px;font-size:14px;color:#94a3b8;">Sales Representative</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:800;color:#c084fc;">${agent.name || agent.email}</p>
            <div style="border-top:1px dashed rgba(255,255,255,0.08);margin-bottom:16px;"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:center;">
              <div>
                <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;">Gross USD Sales</p>
                <p style="margin:0;font-size:20px;font-weight:900;color:#f8fafc;">${formatMoney(usdSales, 'USD')}</p>
              </div>
              <div>
                <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;">Gross CRC Sales</p>
                <p style="margin:0;font-size:20px;font-weight:900;color:#f8fafc;">${formatMoney(crcSales, 'CRC')}</p>
              </div>
            </div>
          </div>

          <!-- Commission Highlight Summary -->
          <div style="background:linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(56, 189, 248, 0.05) 100%);border:1px solid rgba(168, 85, 247, 0.3);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
            <span style="font-size:12px;font-weight:bold;color:#c084fc;text-transform:uppercase;letter-spacing:1px;background:rgba(168, 85, 247, 0.1);padding:4px 10px;border-radius:12px;">Commission Rate: ${rate}%</span>
            <h2 style="font-size:15px;color:#e2e8f0;margin:16px 0 8px;font-weight:600;">Total Payout Owed This Week</h2>
            <div style="font-size:26px;font-weight:950;color:#ffffff;line-height:1.2;margin:0 0 4px 0;">
              ${usdCommission > 0 ? `${formatMoney(usdCommission, 'USD')}` : ''}
              ${usdCommission > 0 && crcCommission > 0 ? ' + ' : ''}
              ${crcCommission > 0 ? `${formatMoney(crcCommission, 'CRC')}` : ''}
              ${usdCommission === 0 && crcCommission === 0 ? '$0.00' : ''}
            </div>
            <p style="margin:0;font-size:12px;color:#64748b;">Commission is calculated automatically based on total successful USD and CRC orders closed.</p>
          </div>

          <!-- Closed Orders Table -->
          <h3 style="font-size:13px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Closed Orders History</h3>
          <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.05);border-radius:12px;overflow:hidden;margin-bottom:24px;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.05);">
                  <th style="padding:12px;font-size:11px;font-weight:bold;text-align:left;color:#94a3b8;text-transform:uppercase;">Order #</th>
                  <th style="padding:12px;font-size:11px;font-weight:bold;text-align:left;color:#94a3b8;text-transform:uppercase;">Date</th>
                  <th style="padding:12px;font-size:11px;font-weight:bold;text-align:left;color:#94a3b8;text-transform:uppercase;">Customer</th>
                  <th style="padding:12px;font-size:11px;font-weight:bold;text-align:right;color:#94a3b8;text-transform:uppercase;">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                ${ordersTableRows}
              </tbody>
            </table>
          </div>

          <!-- Footer/Support -->
          <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px;text-align:center;font-size:11px;color:#64748b;">
            Peptides Costa Rica Administrative Automated CRM · Sales and Invoicing Ledger
          </div>
        </div>
      `;

      // 6. Save or update Pending payout in database
      const { data: existingPayout } = await supabaseAdmin
        .from('commission_payouts')
        .select('*')
        .eq('agent_email', agent.email)
        .eq('status', 'Pending')
        .maybeSingle();

      let saveError = null;
      if (existingPayout) {
        const { error } = await supabaseAdmin
          .from('commission_payouts')
          .update({
            agent_id: agent.user_id || null,
            agent_name: agent.name || null,
            start_date: startDateStr,
            end_date: endDateStr,
            usd_sales: usdSales,
            crc_sales: crcSales,
            commission_rate: rate,
            usd_commission: usdCommission,
            crc_commission: crcCommission,
            orders_data: agentOrders,
            email_html: emailHtml
          })
          .eq('id', existingPayout.id);
        saveError = error;
      } else {
        const { error } = await supabaseAdmin
          .from('commission_payouts')
          .insert([{
            agent_id: agent.user_id || null,
            agent_email: agent.email,
            agent_name: agent.name || null,
            start_date: startDateStr,
            end_date: endDateStr,
            usd_sales: usdSales,
            crc_sales: crcSales,
            commission_rate: rate,
            usd_commission: usdCommission,
            crc_commission: crcCommission,
            status: 'Pending',
            orders_data: agentOrders,
            email_html: emailHtml
          }]);
        saveError = error;
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
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;background:#0b0f19;max-width:640px;margin:0 auto;padding:32px 24px;border:1px solid rgba(255,255,255,0.08);border-radius:16px;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;padding:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:12px;">
                <span style="font-size:24px;font-weight:bold;color:#f8fafc;letter-spacing:1px;">🧬 PEPTIDES COSTA RICA</span>
              </div>
              <h1 style="color:#ffffff;font-size:20px;font-weight:800;margin:0 0 6px;letter-spacing:-0.5px;">Pending Commissions Action Required</h1>
              <p style="color:#94a3b8;font-size:13px;margin:0;">Weekly commission calculations are complete and awaiting admin approval.</p>
            </div>

            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:20px;margin-bottom:24px;">
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.08);text-align:left;">
                    <th style="padding:10px;font-size:11px;font-weight:bold;color:#94a3b8;text-transform:uppercase;">Representative</th>
                    <th style="padding:10px;font-size:11px;font-weight:bold;text-align:center;color:#94a3b8;text-transform:uppercase;">Closed Orders</th>
                    <th style="padding:10px;font-size:11px;font-weight:bold;text-align:right;color:#94a3b8;text-transform:uppercase;">Pending Payout</th>
                  </tr>
                </thead>
                <tbody>
                  ${reportResults.map(r => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                      <td style="padding:12px 10px;font-size:13px;font-weight:bold;color:#f8fafc;">${r.name || r.email}</td>
                      <td style="padding:12px 10px;font-size:13px;text-align:center;color:#cbd5e1;">${r.closedOrdersCount}</td>
                      <td style="padding:12px 10px;font-size:13px;text-align:right;font-weight:bold;color:#c084fc;">
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
              <a href="https://peptidescostarica.net/admin?tab=team" style="display:inline-block;background:#38bdf8;color:#0b0f19;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:13px;">
                Review & Approve Payouts
              </a>
            </div>

            <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px;text-align:center;font-size:11px;color:#64748b;">
              Peptides Costa Rica Administrative Automated CRM · Sales and Invoicing Ledger
            </div>
          </div>
        `;

        await transporter.sendMail({
          from: NOTIFICATION_FROM,
          to: ADMIN_CC_EMAILS,
          subject: `🧬 [Action Required] Weekly Commissions Pending Approval (${reportResults.length} Agents)`,
          html: adminEmailHtml,
          text: `Weekly commission reports are generated and pending approval for: ${reportResults.map(r => `${r.name || r.email} (Payout: ${r.usdCommission} + ${r.crcCommission})`).join(', ')}`
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
        end: endDateStr
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
