import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ORDER_NOTIFICATION_TO || 'omerforce@gmail.com';

export async function GET(request) {
  try {
    // 1. Basic Auth for Vercel Cron Jobs
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch orders from the last 7 days with affiliate commissions
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Only fetch orders that are "Paid" or "Pending" if manual transfer is considered success
    // To be safe, we'll fetch where affiliate_commission_usd > 0
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        total_usd,
        affiliate_commission_usd,
        created_at,
        affiliates (
          id,
          name,
          email
        )
      `)
      .not('affiliate_id', 'is', null)
      .gte('created_at', sevenDaysAgo.toISOString());

    if (error) throw error;

    if (!orders || orders.length === 0) {
      return NextResponse.json({ message: 'No affiliate commissions this week.' });
    }

    // 3. Group commissions by affiliate
    const payouts = {};
    let totalCommissionsUsd = 0;

    for (const order of orders) {
      // Skip array wrappers if any
      const aff = Array.isArray(order.affiliates) ? order.affiliates[0] : order.affiliates;
      if (!aff) continue;
      
      if (!payouts[aff.id]) {
        payouts[aff.id] = {
          name: aff.name,
          email: aff.email,
          totalEarned: 0,
          ordersCount: 0
        };
      }
      
      const comm = Number(order.affiliate_commission_usd || 0);
      if (comm > 0) {
        payouts[aff.id].totalEarned += comm;
        payouts[aff.id].ordersCount += 1;
        totalCommissionsUsd += comm;
      }
    }

    if (Object.keys(payouts).length === 0) {
      return NextResponse.json({ message: 'No valid commissions to payout.' });
    }

    // 4. Setup Nodemailer
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP settings not configured' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: { rejectUnauthorized: false }
    });

    // 5. Send Admin Summary Report
    const adminHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Weekly Affiliate Commission Report</h2>
        <p>Total commissions generated this week: <strong style="font-size: 18px; color: #059669;">$${totalCommissionsUsd.toFixed(2)}</strong></p>
        <hr style="border: 1px solid #e2e8f0; margin: 20px 0;" />
        ${Object.values(payouts).map(p => `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 12px;">
            <p style="margin: 0 0 8px;"><strong>${p.name}</strong> (<a href="mailto:${p.email}">${p.email}</a>)</p>
            <p style="margin: 0 0 4px;">Orders this week: <strong>${p.ordersCount}</strong></p>
            <p style="margin: 0;">Owed Payout: <strong style="color: #059669; font-size: 16px;">$${p.totalEarned.toFixed(2)}</strong></p>
          </div>
        `).join('')}
      </div>
    `;

    // Only send the admin email to the first email in the list to avoid spamming multiple admin addresses if not wanted, but we'll send to the whole raw string.
    await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
      from: `Peptides Costa Rica System <${SMTP_USER}>`,
      to: ADMIN_EMAIL,
      subject: `Weekly Affiliate Report - $${totalCommissionsUsd.toFixed(2)}`,
      html: adminHtml,
    });

    // 6. Send Individual Affiliate Emails
    for (const payout of Object.values(payouts)) {
      if (payout.totalEarned > 0) {
        const affHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0f172a;">Hello ${payout.name},</h2>
            <p style="color: #334155;">Here is your weekly affiliate summary from <strong>Peptides Costa Rica</strong>.</p>
            
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <p style="margin: 0 0 8px; color: #166534;">Your promo code was used on <strong>${payout.ordersCount}</strong> orders this week.</p>
              <p style="margin: 0; color: #166534;">Your total commission earned is:</p>
              <p style="margin: 8px 0 0; font-size: 24px; font-weight: 900; color: #15803d;">$${payout.totalEarned.toFixed(2)}</p>
            </div>

            <p style="color: #334155;">We will be reaching out shortly to process your payout via your preferred payment method.</p>
            <p style="color: #334155; margin-top: 24px;">Thank you for your partnership!<br/><strong>Peptides Costa Rica</strong></p>
          </div>
        `;

        await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
          from: `Peptides Costa Rica Affiliates <${SMTP_USER}>`,
          to: payout.email,
          subject: `Your Weekly Affiliate Summary - Peptides Costa Rica`,
          html: affHtml,
        });
      }
    }

    return NextResponse.json({ success: true, affiliatesProcessed: Object.keys(payouts).length, totalCommissionsUsd });

  } catch (err) {
    console.error('Affiliate cron error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
