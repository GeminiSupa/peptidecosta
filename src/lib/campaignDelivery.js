import nodemailer from 'nodemailer';
import { createUnsubscribeToken } from '@/lib/marketingTokens';
import { applyMarketingEmailFooter } from '@/lib/marketingEmailFooter';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { clampOutlookButtonSizes } from '@/lib/emailHtmlSafety';
import { getCampaignSmtpConfig, isCampaignRackspaceSmtp } from '@/lib/campaignSmtp';

const DOMAIN = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.costapeptides.com';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function wait(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

function campaignSafetyConfig() {
  const rackspace = isCampaignRackspaceSmtp();
  return {
    rackspace,
    batchSize: positiveInteger(
      process.env.EMAIL_CAMPAIGN_BATCH_SIZE || process.env.EMAIL_CAMPAIGN_MAX_RECIPIENTS_PER_SEND,
      rackspace ? 50 : 1000,
    ),
    batchIntervalMinutes: nonNegativeInteger(
      process.env.EMAIL_CAMPAIGN_BATCH_INTERVAL_MINUTES,
      rackspace ? 10 : 0,
    ),
    sendDelayMs: positiveInteger(
      process.env.EMAIL_CAMPAIGN_SEND_DELAY_MS,
      rackspace ? 2500 : 0,
    ),
    maxConnections: positiveInteger(
      process.env.EMAIL_CAMPAIGN_SMTP_CONNECTIONS,
      rackspace ? 1 : 5,
    ),
  };
}

export class CampaignDeliveryError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function personalize(value, subscriber) {
  const first = String(subscriber?.first_name || '').trim();
  const last = String(subscriber?.last_name || '').trim();

  // First-name tags in every style the editor might emit: [FIRST_NAME] and the
  // Mailchimp merge tags *|FIRST:NAME|* / *|FNAME|*. Without matching these the
  // raw tag shipped to every recipient (e.g. "HOLA *|FIRST:NAME|*!"). When the
  // name is empty, swallow one leading space so a nameless greeting reads
  // "HOLA!" rather than "HOLA !"; when present, keep the space.
  const firstNameTag = /[ \t]?(?:\[FIRST_NAME\]|\*\|\s*(?:FIRST:?NAME|FNAME)\s*\|\*)/gi;
  const lastNameTag = /[ \t]?(?:\[LAST_NAME\]|\*\|\s*(?:LAST:?NAME|LNAME)\s*\|\*)/gi;

  return String(value || '')
    .replace(firstNameTag, (match) => (first ? (match.startsWith(' ') || match.startsWith('\t') ? ' ' : '') + first : ''))
    .replace(lastNameTag, (match) => (last ? (match.startsWith(' ') || match.startsWith('\t') ? ' ' : '') + last : ''));
}

function trackedHtml(campaign, subscriber) {
  const safeHtml = clampOutlookButtonSizes(campaign.html_content);
  const content = personalize(safeHtml, subscriber).replace(/href="([^"]+)"/g, (match, url) => {
    if (!url.startsWith('http') && !url.startsWith('/')) return match;
    const absoluteUrl = url.startsWith('/') ? `${DOMAIN}${url}` : url;
    const separator = absoluteUrl.includes('?') ? '&' : '?';
    const destination = `${absoluteUrl}${separator}utm_source=email&utm_medium=campaign&utm_campaign=${campaign.id}`;
    return `href="${DOMAIN}/api/tracking/click?c=${campaign.id}&s=${subscriber.id}&url=${encodeURIComponent(destination)}"`;
  });
  const unsubscribeUrl = `${DOMAIN}/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(subscriber.id))}`;
  const withFooter = applyMarketingEmailFooter(content, {
    domain: DOMAIN,
    unsubscribeUrl,
    preferencesUrl: unsubscribeUrl,
    viewEmailUrl: DOMAIN,
  });
  return `${withFooter}<img src="${DOMAIN}/api/tracking/open?c=${campaign.id}&s=${subscriber.id}" width="1" height="1" alt="" />`;
}

export async function deliverCampaign(campaignId, options = {}) {
  const { isTestBatch = false, sendWinner = false, winnerVariant = 'A' } = options;
  const smtp = getCampaignSmtpConfig();
  const supabase = getSupabaseAdmin();
  const { data: campaign, error: campaignError } = await supabase.from('email_campaigns').select('*').eq('id', campaignId).single();
  if (campaignError || !campaign) throw new CampaignDeliveryError('Campaign not found', 404);
  if (!campaign.subject_line || !campaign.html_content) throw new CampaignDeliveryError('Campaign must have a subject and saved email body before sending', 400);
  if (!smtp.configured) throw new CampaignDeliveryError('Campaign email sender credentials are not configured', 500);
  if (campaign.status === 'sending') throw new CampaignDeliveryError('Campaign is already sending', 409);
  if (campaign.status === 'sent' && !sendWinner) throw new CampaignDeliveryError('Campaign was already sent. Duplicate it before sending again.', 409);
  if (campaign.status === 'testing' && campaign.is_ab_test && !sendWinner) throw new CampaignDeliveryError('A/B test is in progress. Pick a winner before sending the remaining subscribers.', 409);
  if (campaign.status === 'scheduled' && campaign.scheduled_for && new Date(campaign.scheduled_for).getTime() > Date.now()) {
    throw new CampaignDeliveryError(`Campaign is scheduled for ${new Date(campaign.scheduled_for).toLocaleString()}`, 409);
  }

  let subscriberQuery = supabase.from('email_subscribers').select('*').eq('status', 'subscribed');
  if (campaign.target_tags?.length) subscriberQuery = subscriberQuery.contains('tags', [campaign.target_tags[0]]);
  const [
    { data: subscribers, error: subscriberError },
    { data: suppressions, error: suppressionError },
    { data: previousSends, error: previousSendsError },
  ] = await Promise.all([
    subscriberQuery,
    supabase.from('marketing_suppressions').select('identity,channel').eq('active', true).in('channel', ['email', 'all']),
    supabase.from('campaign_sends').select('subscriber_id').eq('campaign_id', campaignId),
  ]);
  if (subscriberError || !subscribers?.length) throw new CampaignDeliveryError('No active subscribers found for this segment', 400);
  if (suppressionError) throw new CampaignDeliveryError('Marketing suppression checks are unavailable; send cancelled for safety.', 503);
  if (previousSendsError) throw new CampaignDeliveryError('Campaign send counter is unavailable; send cancelled for safety.', 503);

  const blocked = new Set((suppressions || []).map(item => String(item.identity || '').trim().toLowerCase()));
  let targets = subscribers.filter(item => !blocked.has(String(item.email || '').trim().toLowerCase()));
  if (!targets.length) throw new CampaignDeliveryError('Every subscriber in this segment is suppressed.', 400);
  const totalEligible = targets.length;
  const sentIds = new Set((previousSends || []).map(item => item.subscriber_id));
  const alreadySent = targets.filter(item => sentIds.has(item.id)).length;

  if (isTestBatch && campaign.is_ab_test) {
    targets = targets
      .filter(item => !sentIds.has(item.id))
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.max(2, Math.floor(targets.length * 0.2)));
  } else {
    targets = targets.filter(item => !sentIds.has(item.id));
  }
  if (!targets.length) throw new CampaignDeliveryError('No remaining subscribers to send to.', 400);

  const safety = campaignSafetyConfig();
  const remainingBeforeBatch = targets.length;
  const batchTargets = targets.slice(0, safety.batchSize);

  const claimedStatus = isTestBatch ? 'testing' : 'sending';
  const { data: claimed, error: claimError } = await supabase.from('email_campaigns')
    .update({ status: claimedStatus, scheduled_for: null, sent_at: campaign.sent_at || new Date().toISOString() })
    .eq('id', campaignId)
    .eq('status', campaign.status)
    .select('id');
  if (claimError) throw claimError;
  if (!claimed?.length) throw new CampaignDeliveryError('Campaign was claimed by another sender', 409);

  const transporter = nodemailer.createTransport({
    pool: true,
    maxConnections: safety.maxConnections,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  let sent = 0;
  let failed = 0;

  try {
    for (let index = 0; index < batchTargets.length; index += 1) {
      const subscriber = batchTargets[index];
      try {
        const useVariantB = campaign.is_ab_test && ((isTestBatch && index % 2 !== 0) || (sendWinner && winnerVariant === 'B'));
        const variant = useVariantB ? 'B' : 'A';
        const subject = personalize(useVariantB ? campaign.subject_line_b : campaign.subject_line, subscriber);
        // Gmail/Yahoo bulk-sender rules REQUIRE one-click unsubscribe headers —
        // without them, campaigns land in spam and the domain gets rate-limited.
        const unsubscribeUrl = `${DOMAIN}/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(subscriber.id))}`;
        await transporter.sendMail({
          ...(process.env.CAMPAIGN_BCC_EMAIL ? { bcc: process.env.CAMPAIGN_BCC_EMAIL } : {}),
          from: smtp.from,
          to: subscriber.email,
          subject,
          html: trackedHtml(campaign, subscriber),
          replyTo: campaign.reply_to || smtp.replyTo,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${smtp.replyTo}?subject=unsubscribe>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        const { error } = await supabase.from('campaign_sends').insert({ campaign_id: campaign.id, subscriber_id: subscriber.id, subject_variant: variant });
        if (error) throw error;
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error('[Campaign delivery] Subscriber send failed', { campaignId: campaign.id, subscriberId: subscriber.id, error: error.message });
      }
      if (index < batchTargets.length - 1) await wait(safety.sendDelayMs);
    }
  } finally {
    transporter.close();
  }

  const sentTotal = alreadySent + sent;
  const remaining = Math.max(totalEligible - sentTotal, 0);
  const nextBatchAt = !isTestBatch && remaining > 0
    ? new Date(Date.now() + safety.batchIntervalMinutes * 60 * 1000).toISOString()
    : null;
  const nextStatus = isTestBatch ? 'testing' : remaining > 0 ? 'scheduled' : sentTotal > 0 ? 'sent' : 'draft';
  await supabase
    .from('email_campaigns')
    .update({ status: nextStatus, scheduled_for: nextBatchAt })
    .eq('id', campaign.id);

  return {
    campaignId,
    provider: safety.rackspace ? 'rackspace' : 'smtp',
    batchSize: safety.batchSize,
    batchIntervalMinutes: safety.batchIntervalMinutes,
    targeted: batchTargets.length,
    totalEligible,
    alreadySent,
    sentTotal,
    remainingBeforeBatch,
    remaining,
    sent,
    failed,
    nextBatchAt,
    completed: remaining === 0,
  };
}
