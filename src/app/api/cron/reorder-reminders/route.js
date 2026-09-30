import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCronRequest } from '@/lib/cronAuth';
import nodemailer from 'nodemailer';
import { getCampaignSmtpConfig } from '@/lib/campaignSmtp';
import { buildRefillEmail, REFILL_AFTER_DAYS, shouldSendRefillReminder } from '@/lib/refillReminder.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = verifyCronRequest(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();

    // Paid orders from at least 30 days ago that have not been reminded yet.
    // Cancelled and unpaid orders are not a stock refill.
    const cutoff = new Date(Date.now() - REFILL_AFTER_DAYS * 24 * 60 * 60 * 1000);

    const { data: eligibleOrders, error } = await supabase
      .from('orders')
      .select('id, customer_email, customer_name, items, status, reorder_reminded_at')
      .is('reorder_reminded_at', null)
      .lte('created_at', cutoff.toISOString())
      .or('status.ilike.%paid%,status.ilike.%complet%')
      .limit(50);

    if (error) {
      throw error;
    }

    if (!eligibleOrders || eligibleOrders.length === 0) {
      return NextResponse.json({ message: 'No eligible orders for reorder reminders.' });
    }

    const smtp = getCampaignSmtpConfig();
    if (!smtp.configured) {
      return NextResponse.json({ error: 'Campaign SMTP settings missing' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass }
    });

    let sentCount = 0;

    for (const order of eligibleOrders) {
      if (!shouldSendRefillReminder(order)) {
        // A row that cannot be a refill would otherwise sit at the front of
        // every batch and block orders that can.
        await supabase
          .from('orders')
          .update({ reorder_reminded_at: new Date().toISOString() })
          .eq('id', order.id);
        continue;
      }

      const { subject, html } = buildRefillEmail({
        customerName: order.customer_name,
        items: order.items,
      });

      try {
        await transporter.sendMail({
          from: smtp.from,
          replyTo: smtp.replyTo,
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
