import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Prevent caching so cron runs accurately

export async function GET(request) {
  try {
    const supabase = getSupabaseAdmin();

    // Find orders that are:
    // - Order Complete
    // - Updated at least 5 days ago
    // - Have not been asked for a review yet
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const { data: eligibleOrders, error } = await supabase
      .from('orders')
      .select('id, customer_email, customer_name, customer_phone')
      .eq('status', 'Order Complete')
      .is('review_requested_at', null)
      .lte('updated_at', fiveDaysAgo.toISOString())
      .limit(50); // Process in batches to avoid timeouts

    if (error) {
      throw error;
    }

    if (!eligibleOrders || eligibleOrders.length === 0) {
      return NextResponse.json({ message: 'No eligible orders for review requests.' });
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

      const reviewLink = process.env.REVIEW_LINK_GOOGLE || process.env.REVIEW_LINK_TRUSTPILOT || 'https://catalog.peptidescostarica.net/customer-feedback';
      const subject = `How is your research going? 🧪`;
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
          <h2>We'd love to hear from you!</h2>
          <p>Hi ${order.customer_name || 'there'},</p>
          <p>It's been a few days since your Peptides Costa Rica order was completed. We hope your research is going perfectly!</p>
          <p>If you have a moment, we would greatly appreciate it if you could leave a review about your experience with our products and service.</p>
          <p>
            <a href="${reviewLink}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Leave a Review</a>
          </p>
          <p>Thank you,<br/>The Peptides Costa Rica Team</p>
        </div>
      `;

      try {
        await transporter.sendMail({
          from: `Peptides Costa Rica <${SMTP_USER}>`,
          replyTo: 'info@peptidescostarica.net',
          to: order.customer_email.trim(),
          subject,
          html,
        });

        // --- NEW: WhatsApp Review Request ---
        const metaToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

        if (order.customer_phone && metaToken && metaPhoneId) {
          let cleanPhone = order.customer_phone.replace(/[^0-9]/g, '');
          if (cleanPhone.length === 8) cleanPhone = '506' + cleanPhone;

          await fetch(`https://graph.facebook.com/v25.0/${metaPhoneId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${metaToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: cleanPhone,
              type: 'template',
              template: {
                name: 'review_request_5_day',
                language: { code: 'en' },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: order.customer_name || 'there' },
                      { type: 'text', text: reviewLink }
                    ]
                  }
                ]
              }
            }),
          }).catch(e => console.error(`Failed to send WhatsApp review request to ${cleanPhone}`, e));
        }
        // ------------------------------------

        // Mark as sent in DB
        await supabase
          .from('orders')
          .update({ review_requested_at: new Date().toISOString() })
          .eq('id', order.id);

        sentCount++;
      } catch (err) {
        console.error(`Failed to send review request to ${order.customer_email}`, err);
      }
    }

    return NextResponse.json({ success: true, emailsSent: sentCount });

  } catch (err) {
    console.error('[CRON Review Requests]', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
