import nodemailer from 'nodemailer';
import { createUnsubscribeToken } from '@/lib/marketingTokens';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const DOMAIN = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.costapeptides.com';
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${process.env.SMTP_USER || 'omerforce@gmail.com'}>`;

export class CampaignDeliveryError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function personalize(value, subscriber) {
  return String(value || '')
    .replace(/\[FIRST_NAME\]/g, subscriber.first_name || 'Friend')
    .replace(/\[LAST_NAME\]/g, subscriber.last_name || '');
}

function trackedHtml(campaign, subscriber) {
  const content = personalize(campaign.html_content, subscriber).replace(/href="([^"]+)"/g, (match, url) => {
    if (!url.startsWith('http') && !url.startsWith('/')) return match;
    const absoluteUrl = url.startsWith('/') ? `${DOMAIN}${url}` : url;
    const separator = absoluteUrl.includes('?') ? '&' : '?';
    const destination = `${absoluteUrl}${separator}utm_source=email&utm_medium=campaign&utm_campaign=${campaign.id}`;
    return `href="${DOMAIN}/api/tracking/click?c=${campaign.id}&s=${subscriber.id}&url=${encodeURIComponent(destination)}"`;
  });
  const unsubscribeUrl = `${DOMAIN}/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(subscriber.id))}`;
  return `${content}
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #eaeaea;text-align:center;color:#666;font-size:12px;font-family:sans-serif">
      <p>You are receiving this email because you subscribed to Costa Peptides.</p>
      <p><a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline">Unsubscribe from our list</a></p>
      <img src="${DOMAIN}/api/tracking/open?c=${campaign.id}&s=${subscriber.id}" width="1" height="1" alt="" />
    </div>`;
}

export async function deliverCampaign(campaignId, options = {}) {
  const { isTestBatch = false, sendWinner = false, winnerVariant = 'A' } = options;
  const supabase = getSupabaseAdmin();
  const { data: campaign, error: campaignError } = await supabase.from('email_campaigns').select('*').eq('id', campaignId).single();
  if (campaignError || !campaign) throw new CampaignDeliveryError('Campaign not found', 404);
  if (!campaign.subject_line || !campaign.html_content) throw new CampaignDeliveryError('Campaign must have a subject and saved email body before sending', 400);
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_HOST) throw new CampaignDeliveryError('Email sender credentials are not configured', 500);
  if (campaign.status === 'sending') throw new CampaignDeliveryError('Campaign is already sending', 409);
  if (campaign.status === 'sent' && !sendWinner) throw new CampaignDeliveryError('Campaign was already sent. Duplicate it before sending again.', 409);
  if (campaign.status === 'testing' && campaign.is_ab_test && !sendWinner) throw new CampaignDeliveryError('A/B test is in progress. Pick a winner before sending the remaining subscribers.', 409);

  let subscriberQuery = supabase.from('email_subscribers').select('*').eq('status', 'subscribed');
  if (campaign.target_tags?.length) subscriberQuery = subscriberQuery.contains('tags', [campaign.target_tags[0]]);
  const [{ data: subscribers, error: subscriberError }, { data: suppressions, error: suppressionError }] = await Promise.all([
    subscriberQuery,
    supabase.from('marketing_suppressions').select('identity,channel').eq('active', true).in('channel', ['email', 'all']),
  ]);
  if (subscriberError || !subscribers?.length) throw new CampaignDeliveryError('No active subscribers found for this segment', 400);
  if (suppressionError) throw new CampaignDeliveryError('Marketing suppression checks are unavailable; send cancelled for safety.', 503);

  const blocked = new Set((suppressions || []).map(item => String(item.identity || '').trim().toLowerCase()));
  let targets = subscribers.filter(item => !blocked.has(String(item.email || '').trim().toLowerCase()));
  if (!targets.length) throw new CampaignDeliveryError('Every subscriber in this segment is suppressed.', 400);

  if (isTestBatch && campaign.is_ab_test) {
    targets = targets.sort(() => 0.5 - Math.random()).slice(0, Math.max(2, Math.floor(targets.length * 0.2)));
  } else if (sendWinner) {
    const { data: previous } = await supabase.from('campaign_sends').select('subscriber_id').eq('campaign_id', campaignId);
    const sentIds = new Set((previous || []).map(item => item.subscriber_id));
    targets = targets.filter(item => !sentIds.has(item.id));
  }
  if (!targets.length) throw new CampaignDeliveryError('No remaining subscribers to send to.', 400);

  const claimedStatus = isTestBatch ? 'testing' : 'sending';
  const { data: claimed, error: claimError } = await supabase.from('email_campaigns')
    .update({ status: claimedStatus, sent_at: campaign.sent_at || new Date().toISOString() })
    .eq('id', campaignId)
    .eq('status', campaign.status)
    .select('id');
  if (claimError) throw claimError;
  if (!claimed?.length) throw new CampaignDeliveryError('Campaign was claimed by another sender', 409);

  const transporter = nodemailer.createTransport({
    pool: true,
    maxConnections: 5,
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  let sent = 0;
  let failed = 0;

  try {
    for (let offset = 0; offset < targets.length; offset += 10) {
      const batch = targets.slice(offset, offset + 10);
      const results = await Promise.allSettled(batch.map(async (subscriber, index) => {
        const useVariantB = campaign.is_ab_test && ((isTestBatch && (offset + index) % 2 !== 0) || (sendWinner && winnerVariant === 'B'));
        const variant = useVariantB ? 'B' : 'A';
        const subject = personalize(useVariantB ? campaign.subject_line_b : campaign.subject_line, subscriber);
        // Gmail/Yahoo bulk-sender rules REQUIRE one-click unsubscribe headers —
        // without them, campaigns land in spam and the domain gets rate-limited.
        const unsubscribeUrl = `${DOMAIN}/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(subscriber.id))}`;
        await transporter.sendMail({
          bcc: process.env.BCC_EMAIL || 'info@peptidescostarica.net',
          from: NOTIFICATION_FROM,
          to: subscriber.email,
          subject,
          html: trackedHtml(campaign, subscriber),
          replyTo: campaign.reply_to || undefined,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${process.env.SMTP_USER}?subject=unsubscribe>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        const { error } = await supabase.from('campaign_sends').insert({ campaign_id: campaign.id, subscriber_id: subscriber.id, subject_variant: variant });
        if (error) throw error;
      }));
      sent += results.filter(result => result.status === 'fulfilled').length;
      failed += results.filter(result => result.status === 'rejected').length;
    }
  } finally {
    transporter.close();
  }

  await supabase.from('email_campaigns').update({ status: isTestBatch ? 'testing' : sent > 0 ? 'sent' : 'draft' }).eq('id', campaign.id);
  return { campaignId, targeted: targets.length, sent, failed };
}
