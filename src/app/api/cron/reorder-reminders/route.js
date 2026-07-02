import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const supabase = getSupabaseAdmin();

    // Find orders that are:
    // - Created at least 30 days ago
    // - Have not been reminded to reorder yet
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: eligibleOrders, error } = await supabase
      .from('orders')
      .select('id, customer_email, customer_name, items')
      .is('reorder_reminded_at', null)
      .lte('created_at', thirtyDaysAgo.toISOString())
      .limit(50); // Process in batches

    if (error) {
      throw error;
    }

    if (!eligibleOrders || eligibleOrders.length === 0) {
      return NextResponse.json({ message: 'No eligible orders for reorder reminders.' });
    }

    const SMTP_HOST = process.env.SMTP_HOST;
    const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
    const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP settings missing' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false }
    });

    let sentCount = 0;

    for (const order of eligibleOrders) {
      if (!order.customer_email) continue;
      
      // Determine what they bought so we can mention it
      let topItem = 'your research supplies';
      if (Array.isArray(order.items) && order.items.length > 0) {
        topItem = order.items[0].product || topItem;
      }

      const subject = `Time to restock ${topItem}? 📦`;
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
          <h2>Time for a refill?</h2>
          <p>Hi ${order.customer_name || 'there'},</p>
          <p>It's been about a month since you ordered <strong>${topItem}</strong>. If you're running low on supplies, we've got you covered!</p>
          <p>Restock your research materials today and enjoy fast shipping directly from our Costa Rica facility.</p>
          <p>
            <a href="https://catalog.peptidescostarica.net/catalog" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Shop the Catalog</a>
          </p>
          <p>Need assistance with your next cycle? Reply to this email or reach us on WhatsApp!</p>
          <p>Thank you,<br/>The Peptides Costa Rica Team</p>
        </div>
      `;

      try {
        await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
          from: `Peptides Costa Rica <${SMTP_USER}>`,
          replyTo: 'omerforce@gmail.com',
          to: order.customer_email.trim(),
          subject,
          html,
        });

        // Mark as sent in DB
        await supabase
          .from('orders')
          .update({ reorder_reminded_at: new Date().toISOString() })
          .eq('id', order.id);

        sentCount++;
      } catch (err) {
        console.error(`Failed to send reorder reminder to ${order.customer_email}`, err);
      }
    }

    return NextResponse.json({ success: true, emailsSent: sentCount });

  } catch (err) {
    console.error('[CRON Reorder Reminders]', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
