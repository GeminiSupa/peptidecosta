import nodemailer from 'nodemailer';
import { createUnsubscribeToken } from '@/lib/marketingTokens';
import { applyMarketingEmailFooter } from '@/lib/marketingEmailFooter';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { clampOutlookButtonSizes, personalizeMergeTags, stabilizeSimpleLinkRows } from '@/lib/emailHtmlSafety';
import {
  getCampaignRackspaceFallbackSmtpConfig,
  getCampaignSmtpConfig,
  identifyCampaignSmtpProvider,
  isCampaignRackspaceSmtp,
} from '@/lib/campaignSmtp';
import { LIVE_SITE_URL } from '@/lib/publicUrl';
import { leadSubscriberCandidates } from '@/lib/campaignAudience.mjs';

const DOMAIN = process.env.NEXT_PUBLIC_BASE_URL || LIVE_SITE_URL;

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

function truncateError(error, maxLength = 500) {
  return String(error?.message || error || '').slice(0, maxLength);
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function isMissingHealthTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === '42703' || message.includes('campaign_delivery_batches');
}

async function createDeliveryBatchLog(supabase, row) {
  const { data, error } = await supabase
    .from('campaign_delivery_batches')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    if (!isMissingHealthTableError(error)) {
      console.warn('[Campaign delivery] Batch health insert failed:', error.message);
    }
    return null;
  }

  return data?.id || null;
}

async function updateDeliveryBatchLog(supabase, id, updates) {
  if (!id) return;
  const { error } = await supabase
    .from('campaign_delivery_batches')
    .update(updates)
    .eq('id', id);

  if (error && !isMissingHealthTableError(error)) {
    console.warn('[Campaign delivery] Batch health update failed:', error.message);
  }
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
    fallbackSendDelayMs: positiveInteger(
      process.env.EMAIL_CAMPAIGN_FALLBACK_SEND_DELAY_MS,
      2500,
    ),
    maxConnections: positiveInteger(
      process.env.EMAIL_CAMPAIGN_SMTP_CONNECTIONS,
      rackspace ? 1 : 5,
    ),
  };
}

function createCampaignTransporter(smtpConfig, safety) {
  return nodemailer.createTransport({
    pool: true,
    maxConnections: safety.maxConnections,
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: { user: smtpConfig.user, pass: smtpConfig.pass },
  });
}

async function closeTransporter(transporter) {
  if (!transporter) return;
  try {
    transporter.close();
  } catch {
    // Nodemailer close is best-effort; send errors are handled separately.
  }
}

export class CampaignDeliveryError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function personalize(value, subscriber) {
  return personalizeMergeTags(value, {
    firstName: subscriber?.first_name,
    lastName: subscriber?.last_name,
  });
}

function mergeTags(existingTags, nextTags) {
  return [...new Set([...(Array.isArray(existingTags) ? existingTags : []), ...nextTags].filter(Boolean))];
}

function trackedHtml(campaign, subscriber) {
  const safeHtml = stabilizeSimpleLinkRows(clampOutlookButtonSizes(campaign.html_content));
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

async function findWelcomeCampaign(supabase, options = {}) {
  const campaignId = options.campaignId || process.env.CATALOG_WELCOME_CAMPAIGN_ID;
  if (campaignId) {
    const { data, error } = await supabase.from('email_campaigns').select('*').eq('id', campaignId).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const subjectLine = options.subjectLine || 'Peptides Costa Rica: 15% de descuento en tu primer pedido';
  const { data, error } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('subject_line', subjectLine)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertCatalogEmailSubscriber(supabase, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { subscriber: null, subscribed: false, skipped: 'invalid_email' };
  }

  const tags = ['catalog_gate', 'welcome_a'];
  const { data: existing, error: lookupError } = await supabase
    .from('email_subscribers')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    if (String(existing.status || '').toLowerCase() === 'unsubscribed') {
      return { subscriber: existing, subscribed: false, skipped: 'unsubscribed' };
    }

    const { data, error } = await supabase
      .from('email_subscribers')
      .update({
        status: 'subscribed',
        source: existing.source || 'catalog_gate',
        tags: mergeTags(existing.tags, tags),
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return { subscriber: data, subscribed: true, skipped: null };
  }

  const { data, error } = await supabase
    .from('email_subscribers')
    .insert([{
      email: normalizedEmail,
      source: 'catalog_gate',
      status: 'subscribed',
      tags,
    }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return upsertCatalogEmailSubscriber(supabase, normalizedEmail);
    }
    throw error;
  }

  return { subscriber: data, subscribed: true, skipped: null };
}

async function hasActiveEmailSuppression(supabase, email) {
  const { data, error } = await supabase
    .from('marketing_suppressions')
    .select('id')
    .eq('active', true)
    .eq('identity', String(email || '').trim().toLowerCase())
    .in('channel', ['email', 'all'])
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function deliverSingleCampaignToSubscriber(supabase, campaign, subscriber, options = {}) {
  if (!campaign?.id || !subscriber?.id || !subscriber?.email) {
    throw new CampaignDeliveryError('Campaign and subscriber are required', 400);
  }
  if (!campaign.subject_line || !campaign.html_content) {
    throw new CampaignDeliveryError('Welcome campaign must have a subject and saved email body before sending', 400);
  }

  const smtp = getCampaignSmtpConfig();
  if (!smtp.configured) throw new CampaignDeliveryError('Campaign email sender credentials are not configured', 500);

  if (await hasActiveEmailSuppression(supabase, subscriber.email)) {
    return { sent: false, skipped: 'suppressed' };
  }

  const { data: previousSend, error: previousSendError } = await supabase
    .from('campaign_sends')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('subscriber_id', subscriber.id)
    .limit(1)
    .maybeSingle();
  if (previousSendError) throw previousSendError;
  if (previousSend) return { sent: false, skipped: 'already_sent' };

  const safety = campaignSafetyConfig();
  const fallbackSmtp = getCampaignRackspaceFallbackSmtpConfig(smtp);
  const primaryProvider = identifyCampaignSmtpProvider(smtp.host);
  const fallbackProvider = fallbackSmtp ? identifyCampaignSmtpProvider(fallbackSmtp.host) : null;
  const batchLogId = await createDeliveryBatchLog(supabase, {
    campaign_id: campaign.id,
    trigger_type: options.triggerType || 'catalog_welcome',
    status: 'processing',
    provider: primaryProvider,
    fallback_provider: fallbackProvider,
    fallback_used: false,
    batch_size: 1,
    attempted: 1,
    sent: 0,
    failed: 0,
    total_eligible: 1,
    already_sent: 0,
    remaining_before_batch: 1,
    sender_host: smtp.host,
    fallback_host: fallbackSmtp?.host || null,
  });

  const transporter = createCampaignTransporter(smtp, safety);
  const fallbackTransporter = fallbackSmtp ? createCampaignTransporter(fallbackSmtp, safety) : null;
  let fallbackUsed = false;
  const providerErrors = [];
  const unsubscribeUrl = `${DOMAIN}/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(subscriber.id))}`;
  const mail = {
    ...(process.env.CAMPAIGN_BCC_EMAIL ? { bcc: process.env.CAMPAIGN_BCC_EMAIL } : {}),
    from: smtp.from,
    to: subscriber.email,
    subject: personalize(campaign.subject_line, subscriber),
    html: trackedHtml(campaign, subscriber),
    replyTo: campaign.reply_to || smtp.replyTo,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${smtp.replyTo}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };

  try {
    try {
      await transporter.sendMail(mail);
    } catch (primaryError) {
      providerErrors.push({
        provider: primaryProvider,
        message: truncateError(primaryError, 220),
        at: new Date().toISOString(),
      });
      if (!fallbackTransporter) throw primaryError;
      fallbackUsed = true;
      await fallbackTransporter.sendMail({
        ...mail,
        from: fallbackSmtp.from,
        replyTo: campaign.reply_to || fallbackSmtp.replyTo,
        headers: {
          ...mail.headers,
          'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${fallbackSmtp.replyTo}?subject=unsubscribe>`,
        },
      });
    }

    const { error: sendInsertError } = await supabase
      .from('campaign_sends')
      .insert({ campaign_id: campaign.id, subscriber_id: subscriber.id, subject_variant: 'A' });
    if (sendInsertError) throw sendInsertError;

    await updateDeliveryBatchLog(supabase, batchLogId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      sent: 1,
      failed: 0,
      remaining_after_batch: 0,
      fallback_used: fallbackUsed,
      provider_errors: providerErrors.length ? providerErrors : null,
    });

    return { sent: true, skipped: null, campaignId: campaign.id, subscriberId: subscriber.id, fallbackUsed };
  } catch (error) {
    await updateDeliveryBatchLog(supabase, batchLogId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      sent: 0,
      failed: 1,
      remaining_after_batch: 1,
      fallback_used: fallbackUsed,
      error_message: truncateError(error),
      provider_errors: providerErrors.length ? providerErrors : null,
    });
    throw error;
  } finally {
    await closeTransporter(transporter);
    await closeTransporter(fallbackTransporter);
  }
}

export async function sendCatalogWelcomeCampaign(email, options = {}) {
  const supabase = getSupabaseAdmin();
  const subscriberResult = await upsertCatalogEmailSubscriber(supabase, email);
  if (!subscriberResult.subscribed) {
    return { sent: false, skipped: subscriberResult.skipped, subscriber: subscriberResult.subscriber };
  }

  const campaign = await findWelcomeCampaign(supabase, options);
  if (!campaign) {
    return { sent: false, skipped: 'welcome_campaign_missing', subscriber: subscriberResult.subscriber };
  }

  const delivery = await deliverSingleCampaignToSubscriber(supabase, campaign, subscriberResult.subscriber, {
    triggerType: options.triggerType || 'catalog_welcome',
  });

  return {
    ...delivery,
    subscriber: subscriberResult.subscriber,
    campaign,
  };
}

async function addCampaignLeadSubscribers(supabase) {
  const [leadResult, subscriberResult] = await Promise.all([
    supabase.from('catalog_leads').select('*'),
    supabase.from('email_subscribers').select('email,status'),
  ]);
  if (leadResult.error) throw new CampaignDeliveryError(`Unable to load CRM leads: ${leadResult.error.message}`, 503);
  if (subscriberResult.error) throw new CampaignDeliveryError(`Unable to check existing subscribers: ${subscriberResult.error.message}`, 503);

  const candidates = leadSubscriberCandidates(leadResult.data || [], subscriberResult.data || []);
  if (!candidates.length) return { added: 0 };

  const rows = candidates.map(({ id: _virtualId, ...candidate }) => candidate);
  const { data, error } = await supabase
    .from('email_subscribers')
    .upsert(rows, { onConflict: 'email', ignoreDuplicates: true })
    .select('id');
  if (error) throw new CampaignDeliveryError(`Unable to add CRM lead emails to this campaign: ${error.message}`, 503);
  return { added: data?.length || 0 };
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

  if (campaign.include_leads) await addCampaignLeadSubscribers(supabase);

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
  const fallbackSmtp = getCampaignRackspaceFallbackSmtpConfig(smtp);
  const primaryProvider = identifyCampaignSmtpProvider(smtp.host);
  const fallbackProvider = fallbackSmtp ? identifyCampaignSmtpProvider(fallbackSmtp.host) : null;
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

  const triggerType = isTestBatch ? 'test_batch' : sendWinner ? 'winner' : campaign.status === 'scheduled' ? 'scheduled' : 'manual';
  const batchLogId = await createDeliveryBatchLog(supabase, {
    campaign_id: campaign.id,
    trigger_type: triggerType,
    status: 'processing',
    provider: primaryProvider,
    fallback_provider: fallbackProvider,
    fallback_used: false,
    batch_size: safety.batchSize,
    attempted: batchTargets.length,
    sent: 0,
    failed: 0,
    total_eligible: totalEligible,
    already_sent: alreadySent,
    remaining_before_batch: remainingBeforeBatch,
    sender_host: smtp.host,
    fallback_host: fallbackSmtp?.host || null,
  });

  const transporter = createCampaignTransporter(smtp, safety);
  const fallbackTransporter = fallbackSmtp ? createCampaignTransporter(fallbackSmtp, safety) : null;
  let sent = 0;
  let failed = 0;
  let fallbackUsed = false;
  let lastError = null;
  const providerErrors = [];

  try {
    for (let index = 0; index < batchTargets.length; index += 1) {
      const subscriber = batchTargets[index];
      let sentViaFallback = false;
      try {
        const useVariantB = campaign.is_ab_test && ((isTestBatch && index % 2 !== 0) || (sendWinner && winnerVariant === 'B'));
        const variant = useVariantB ? 'B' : 'A';
        const subject = personalize(useVariantB ? campaign.subject_line_b : campaign.subject_line, subscriber);
        // Gmail/Yahoo bulk-sender rules REQUIRE one-click unsubscribe headers —
        // without them, campaigns land in spam and the domain gets rate-limited.
        const unsubscribeUrl = `${DOMAIN}/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(subscriber.id))}`;
        const mail = {
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
        };
        try {
          await transporter.sendMail(mail);
        } catch (primaryError) {
          providerErrors.push({
            provider: primaryProvider,
            message: truncateError(primaryError, 220),
            at: new Date().toISOString(),
          });

          if (!fallbackTransporter) throw primaryError;

          fallbackUsed = true;
          sentViaFallback = true;
          await fallbackTransporter.sendMail({
            ...mail,
            from: fallbackSmtp.from,
            replyTo: campaign.reply_to || fallbackSmtp.replyTo,
            headers: {
              ...mail.headers,
              'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${fallbackSmtp.replyTo}?subject=unsubscribe>`,
            },
          });
        }
        const { error } = await supabase.from('campaign_sends').insert({ campaign_id: campaign.id, subscriber_id: subscriber.id, subject_variant: variant });
        if (error) throw error;
        sent += 1;
      } catch (error) {
        failed += 1;
        lastError = truncateError(error);
        console.error('[Campaign delivery] Subscriber send failed', { campaignId: campaign.id, subscriberId: subscriber.id, error: error.message });
      }
      if (index < batchTargets.length - 1) {
        await wait(sentViaFallback ? safety.fallbackSendDelayMs : safety.sendDelayMs);
      }
    }
  } finally {
    await closeTransporter(transporter);
    await closeTransporter(fallbackTransporter);
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

  const healthStatus = failed === 0 ? 'completed' : sent > 0 ? 'partial' : 'failed';
  await updateDeliveryBatchLog(supabase, batchLogId, {
    status: healthStatus,
    completed_at: new Date().toISOString(),
    sent,
    failed,
    remaining_after_batch: remaining,
    fallback_used: fallbackUsed,
    error_message: lastError,
    provider_errors: providerErrors.length ? providerErrors.slice(-10) : null,
  });

  return {
    campaignId,
    provider: primaryProvider,
    fallbackProvider,
    fallbackUsed,
    batchSize: safety.batchSize,
    batchIntervalMinutes: safety.batchIntervalMinutes,
    fallbackSendDelayMs: safety.fallbackSendDelayMs,
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
