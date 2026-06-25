import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import nodemailer from 'nodemailer';

const DOMAIN = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.costapeptides.com';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { campaign_id } = await request.json();
    
    if (!campaign_id) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    // Fetch the campaign
    const { data: campaign, error: campError } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Fetch active subscribers
    const { data: subscribers, error: subError } = await supabaseAdmin
      .from('email_subscribers')
      .select('*')
      .eq('status', 'subscribed');

    if (subError || !subscribers || subscribers.length === 0) {
      return NextResponse.json({ error: 'No active subscribers found' }, { status: 400 });
    }

    // Update campaign status
    await supabaseAdmin.from('email_campaigns').update({ status: 'sending', sent_at: new Date().toISOString() }).eq('id', campaign_id);

    // Setup Nodemailer (Assuming standard Gmail SMTP for MVP)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Fire and forget batch sending process
    processBatch(transporter, campaign, subscribers);

    return NextResponse.json({ success: true, message: `Sending campaign to ${subscribers.length} subscribers` });
  } catch (err) {
    console.error('Error initiating campaign send:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Background batch processor
async function processBatch(transporter, campaign, subscribers) {
  const supabaseAdmin = getSupabaseAdmin();
  let successCount = 0;
  
  for (const sub of subscribers) {
    try {
      // 1. Inject Tracking Pixel into HTML
      const trackingPixel = `<img src="${DOMAIN}/api/tracking/open?c=${campaign.id}&s=${sub.id}" width="1" height="1" alt="" />`;
      
      // 2. Add Unsubscribe Link
      const unsubscribeUrl = `${DOMAIN}/unsubscribe?s=${sub.id}`;
      const unsubscribeFooter = `
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eaeaea; text-align: center; color: #666; font-size: 12px; font-family: sans-serif;">
          <p>You are receiving this email because you subscribed to Costa Peptides.</p>
          <p><a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe from our list</a></p>
          ${trackingPixel}
        </div>
      `;

      // Simple click tracking replacement (A more robust version would use cheerio/regex to rewrite all <a> tags)
      let finalHtml = campaign.html_content + unsubscribeFooter;

      // Send Email
      await transporter.sendMail({
        from: `"Costa Peptides" <${process.env.EMAIL_USER}>`,
        to: sub.email,
        subject: campaign.subject_line,
        html: finalHtml,
      });

      // Log the send
      await supabaseAdmin.from('campaign_sends').insert([{
        campaign_id: campaign.id,
        subscriber_id: sub.id
      }]);

      successCount++;
      
      // Basic rate limiting (pause 1s between emails to avoid hitting SMTP limits too quickly)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error(`Failed to send to ${sub.email}:`, e);
      // Optional: log bounce
    }
  }

  // Mark campaign as sent
  await supabaseAdmin.from('email_campaigns').update({ status: 'sent' }).eq('id', campaign.id);
  console.log(`Campaign ${campaign.id} complete. Sent ${successCount}/${subscribers.length}.`);
}
