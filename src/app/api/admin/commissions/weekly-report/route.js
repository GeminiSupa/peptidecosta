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

    // 2. Calculate the 7-day range (e.g. from 7 days ago to today)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDateStr = sevenDaysAgo.toISOString();

    // 3. Fetch all non-cancelled orders completed in the last 7 days
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .gte('created_at', startDateStr)
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
            <p style="color:#94a3b8;font-size:13px;margin:0;">Invoice Period: ${new Date(startDateStr).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} to ${new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</p>
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

      let emailSent = false;
      let emailError = null;

      // 6. Send the automated invoice email to agent and CC admin
      if (transporter && agent.email) {
        try {
          const subject = `Weekly Commissions Invoice - ${agent.name || agent.email} [${rate}%]`;
          await transporter.sendMail({
            from: NOTIFICATION_FROM,
            to: agent.email.trim(),
            cc: ADMIN_CC_EMAILS,
            subject: subject,
            html: emailHtml,
            text: `Weekly Commissions Invoice for ${agent.name || agent.email}.\nGross USD: ${formatMoney(usdSales, 'USD')}\nGross CRC: ${formatMoney(crcSales, 'CRC')}\nCommission Owed: ${formatMoney(usdCommission, 'USD')} + ${formatMoney(crcCommission, 'CRC')}`
          });
          emailSent = true;
        } catch (mailErr) {
          console.error(`[Weekly Commissions] Failed to email agent ${agent.email}:`, mailErr);
          emailError = mailErr.message;
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
        emailSent,
        emailError
      });
    }

    return NextResponse.json({
      success: true,
      period: {
        start: startDateStr,
        end: new Date().toISOString()
      },
      payoutReport: reportResults
    });

  } catch (err) {
    console.error('[Weekly Commissions] Critical script crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
