import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createUnsubscribeToken } from '@/lib/marketingTokens';
import nodemailer from 'nodemailer';

const DOMAIN = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.costapeptides.com';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { campaign_id, is_test_batch, send_winner, winner_variant } = await request.json();
    
    if (!campaign_id) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    const { data: campaign, error: campError } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!campaign.subject_line || !campaign.html_content) {
      return NextResponse.json({ error: 'Campaign must have a subject and saved email body before sending' }, { status: 400 });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return NextResponse.json({ error: 'Email sender credentials are not configured' }, { status: 500 });
    }

    if (campaign.status === 'sending') {
      return NextResponse.json({ error: 'Campaign is already sending' }, { status: 409 });
    }

    if (campaign.status === 'sent' && !send_winner) {
      return NextResponse.json({ error: 'Campaign was already sent. Duplicate it before sending again.' }, { status: 409 });
    }

    if (campaign.status === 'testing' && campaign.is_ab_test && !send_winner) {
      return NextResponse.json({ error: 'A/B test is in progress. Pick a winner before sending the remaining subscribers.' }, { status: 409 });
    }

    // Determine target audience based on tags
    let query = supabaseAdmin.from('email_subscribers').select('*').eq('status', 'subscribed');
    if (campaign.target_tags && campaign.target_tags.length > 0) {
      query = query.contains('tags', [campaign.target_tags[0]]);
    }

    const { data: subscribers, error: subError } = await query;

    if (subError || !subscribers || subscribers.length === 0) {
      return NextResponse.json({ error: 'No active subscribers found for this segment' }, { status: 400 });
    }

    // Handle A/B Test Logic
    let targetSubscribers = [...subscribers];
    let newStatus = 'sending';
    
    if (is_test_batch && campaign.is_ab_test) {
      // Pick 20% random for testing
      targetSubscribers = targetSubscribers.sort(() => 0.5 - Math.random()).slice(0, Math.max(2, Math.floor(subscribers.length * 0.2)));
      newStatus = 'testing';
    } else if (send_winner) {
      // If sending winner, we must exclude people who already received it
      const { data: previousSends } = await supabaseAdmin.from('campaign_sends').select('subscriber_id').eq('campaign_id', campaign_id);
      const sentIds = new Set(previousSends?.map(s => s.subscriber_id) || []);
      targetSubscribers = subscribers.filter(s => !sentIds.has(s.id));
      newStatus = 'sending';
    }

    if (targetSubscribers.length === 0) {
      return NextResponse.json({ error: 'No remaining subscribers to send to.' }, { status: 400 });
    }

    await supabaseAdmin.from('email_campaigns').update({ 
      status: newStatus, 
      sent_at: campaign.sent_at || new Date().toISOString() 
    }).eq('id', campaign_id);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Fire and forget batch process
    processBatch(transporter, campaign, targetSubscribers, is_test_batch, send_winner, winner_variant);

    return NextResponse.json({ success: true, message: `Sending to ${targetSubscribers.length} subscribers` });
  } catch (err) {
    console.error('Error initiating campaign send:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Background batch processor
async function processBatch(transporter, campaign, subscribers, is_test_batch, send_winner, winner_variant) {
  const supabaseAdmin = getSupabaseAdmin();
  let successCount = 0;
  
  for (let i = 0; i < subscribers.length; i++) {
    const sub = subscribers[i];
    try {
      // Determine variant for this user
      let variant = 'A';
      let subject = campaign.subject_line;
      
      if (campaign.is_ab_test) {
        if (is_test_batch) {
          // Split 50/50 in the test batch
          if (i % 2 !== 0) {
            variant = 'B';
            subject = campaign.subject_line_b;
          }
        } else if (send_winner && winner_variant === 'B') {
          variant = 'B';
          subject = campaign.subject_line_b;
        }
      }

      // Personalization
      const firstName = sub.first_name || 'Friend';
      const lastName = sub.last_name || '';
      let personalizedSubject = subject.replace(/\[FIRST_NAME\]/g, firstName).replace(/\[LAST_NAME\]/g, lastName);
      let htmlContent = campaign.html_content.replace(/\[FIRST_NAME\]/g, firstName).replace(/\[LAST_NAME\]/g, lastName);

      // E-commerce UTM and click tracking.
      htmlContent = htmlContent.replace(/href="([^"]+)"/g, (match, url) => {
        if (url.startsWith('http') || url.startsWith('/')) {
          const absoluteUrl = url.startsWith('/') ? `${DOMAIN}${url}` : url;
          const separator = absoluteUrl.includes('?') ? '&' : '?';
          const trackedUrl = `${absoluteUrl}${separator}utm_source=email&utm_medium=campaign&utm_campaign=${campaign.id}`;
          const redirectUrl = `${DOMAIN}/api/tracking/click?c=${campaign.id}&s=${sub.id}&url=${encodeURIComponent(trackedUrl)}`;
          return `href="${redirectUrl}"`;
        }
        return match;
      });

      const trackingPixel = `<img src="${DOMAIN}/api/tracking/open?c=${campaign.id}&s=${sub.id}" width="1" height="1" alt="" />`;
      const unsubscribeUrl = `${DOMAIN}/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(sub.id))}`;
      const unsubscribeFooter = `
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eaeaea; text-align: center; color: #666; font-size: 12px; font-family: sans-serif;">
          <p>You are receiving this email because you subscribed to Costa Peptides.</p>
          <p><a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe from our list</a></p>
          ${trackingPixel}
        </div>
      `;

      let finalHtml = htmlContent + unsubscribeFooter;

      await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
        from: `"${campaign.from_name || 'Costa Peptides'}" <${campaign.from_email || process.env.EMAIL_USER}>`,
        to: sub.email,
        subject: personalizedSubject,
        html: finalHtml,
        replyTo: campaign.reply_to || undefined,
      });

      await supabaseAdmin.from('campaign_sends').insert([{
        campaign_id: campaign.id,
        subscriber_id: sub.id,
        subject_variant: variant
      }]);

      successCount++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error(`Failed to send to ${sub.email}:`, e);
    }
  }

  // Update status when complete
  const finalStatus = is_test_batch ? 'testing' : 'sent';
  await supabaseAdmin.from('email_campaigns').update({ status: finalStatus }).eq('id', campaign.id);
  console.log(`Campaign ${campaign.id} batch complete. Sent ${successCount}/${subscribers.length}.`);
}
