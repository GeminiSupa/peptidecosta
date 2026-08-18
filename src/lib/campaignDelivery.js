import nodemailer from 'nodemailer';
import { createTrackingUrlToken, createUnsubscribeToken } from '@/lib/marketingTokens';
import {
  DORMANT_WINDOW_DAYS, behaviorFilterLabel, behaviorNeedsEngagement, behaviorNeedsOrders,
  buildBehaviorSignals, matchesBehaviorFilter, normalizeBehaviorFilter, signalsFor,
} from '@/lib/campaignBehavior.mjs';
import { applyMarketingEmailFooter } from '@/lib/marketingEmailFooter';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { clampOutlookButtonSizes, personalizeMergeTags, stabilizeSimpleLinkRows } from '@/lib/emailHtmlSafety';
import {
  getCampaignSmtpConfig,
  identifyCampaignSmtpProvider,
  isElasticCampaignSmtp,
} from '@/lib/campaignSmtp';
import { LIVE_SITE_URL } from '@/lib/publicUrl';
import {
  emailFromLead,
  leadSubscriberCandidates,
  normalizeAudienceScope,
  resolveCampaignAudience,
  scopeIncludesLeads,
  subscriberMatchesScope,
} from '@/lib/campaignAudience.mjs';
import { classifySmtpFailure } from '@/lib/marketingDelivery.mjs';
import { getCampaignSafetyConfig } from '@/lib/campaignSafety.mjs';

const DOMAIN = process.env.NEXT_PUBLIC_BASE_URL || LIVE_SITE_URL;
const LEAD_UPSERT_CHUNK_SIZE = 500;
const AUDIENCE_LABELS = {
  subscribers: 'Newsletter subscribers only',
  non_subscribers: 'Non-subscribers only',
  leads: 'CRM leads only',
  all: 'Everyone with an email',
};
// A batch that sends nothing is almost always a provider outage or a bad
// sender credential. Backing off keeps the 5-minute cron from hammering SMTP.
const NO_PROGRESS_RETRY_MINUTES = 30;

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

function isMissingBehaviorFilterColumn(error) {
  return String(error?.message || '').includes('behavior_filter');
}

function isMissingAudienceScopeColumn(error) {
  const message = String(error?.message || '');
  return String(error?.code || '') === '42703' || message.includes('audience_scope');
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
    const signature = createTrackingUrlToken(destination);
    return `href="${DOMAIN}/api/tracking/click?c=${campaign.id}&s=${subscriber.id}&url=${encodeURIComponent(destination)}&k=${signature}"`;
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
  if (!isElasticCampaignSmtp(smtp)) throw new CampaignDeliveryError('Campaign email sender must use Elastic Email', 500);

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

  const safety = getCampaignSafetyConfig();
  const primaryProvider = identifyCampaignSmtpProvider(smtp.host);
  const batchLogId = await createDeliveryBatchLog(supabase, {
    campaign_id: campaign.id,
    trigger_type: options.triggerType || 'catalog_welcome',
    status: 'processing',
    provider: primaryProvider,
    fallback_provider: null,
    fallback_used: false,
    batch_size: 1,
    attempted: 1,
    sent: 0,
    failed: 0,
    total_eligible: 1,
    already_sent: 0,
    remaining_before_batch: 1,
    sender_host: smtp.host,
    fallback_host: null,
  });

  const transporter = createCampaignTransporter(smtp, safety);
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
      throw primaryError;
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
      fallback_used: false,
      provider_errors: providerErrors.length ? providerErrors : null,
    });

    return { sent: true, skipped: null, campaignId: campaign.id, subscriberId: subscriber.id, fallbackUsed: false };
  } catch (error) {
    await updateDeliveryBatchLog(supabase, batchLogId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      sent: 0,
      failed: 1,
      remaining_after_batch: 1,
      fallback_used: false,
      error_message: truncateError(error),
      provider_errors: providerErrors.length ? providerErrors : null,
    });
    throw error;
  } finally {
    await closeTransporter(transporter);
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

  // Every lead email, not just the new ones: "leads only" has to include a
  // lead who already happens to sit in email_subscribers, and the upsert below
  // deliberately skips those.
  const leadEmails = new Set(
    (leadResult.data || []).map(lead => emailFromLead(lead)).filter(Boolean),
  );

  const candidates = leadSubscriberCandidates(leadResult.data || [], subscriberResult.data || []);
  if (!candidates.length) return { added: 0, leadEmails };

  const rows = candidates.map(({ id: _virtualId, ...candidate }) => candidate);
  // Thousands of leads in a single upsert can exceed the PostgREST request
  // limit and fail the whole audience, so copy them across in chunks.
  let added = 0;
  for (let offset = 0; offset < rows.length; offset += LEAD_UPSERT_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('email_subscribers')
      .upsert(rows.slice(offset, offset + LEAD_UPSERT_CHUNK_SIZE), { onConflict: 'email', ignoreDuplicates: true })
      .select('id');
    if (error) throw new CampaignDeliveryError(`Unable to add CRM lead emails to this campaign: ${error.message}`, 503);
    added += data?.length || 0;
  }
  return { added, leadEmails };
}

// A dead address that fails at SMTP is never written to campaign_sends, so the
// cron would retry it every batch and the campaign could never reach "sent".
// Retire it once: block it everywhere, and drop it out of future audiences.
async function retireBouncedRecipient(supabase, subscriber, error) {
  const identity = String(subscriber.email || '').trim().toLowerCase();
  if (!identity) return;

  const [suppression, statusUpdate] = await Promise.all([
    supabase.from('marketing_suppressions').upsert({
      identity,
      channel: 'email',
      reason: 'hard_bounce',
      source: 'campaign_send',
      active: true,
      metadata: { detail: truncateError(error, 220) },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'identity,channel' }),
    supabase.from('email_subscribers').update({ status: 'bounced' }).eq('id', subscriber.id),
  ]);

  if (suppression.error) console.warn('[Campaign delivery] Could not suppress bounced address:', suppression.error.message);
  if (statusUpdate.error) console.warn('[Campaign delivery] Could not mark subscriber bounced:', statusUpdate.error.message);
}

// Persist whatever audience the sender actually picked so this send and every
// cron batch that follows target the same people. See resolveCampaignAudience.
async function applyAudienceSelection(supabase, campaign, audience) {
  const { scope, includeLeads, targetTags, behaviorFilter, changed } = resolveCampaignAudience(campaign, audience);

  if (changed) {
    // include_leads is kept in step with the scope so anything still reading
    // the old boolean stays correct.
    const row = {
      audience_scope: scope,
      include_leads: includeLeads,
      target_tags: targetTags,
      behavior_filter: behaviorFilter,
      updated_at: new Date().toISOString(),
    };
    let { error } = await supabase.from('email_campaigns').update(row).eq('id', campaign.id);

    // Until add-campaign-behavior-filter.sql is run the column does not exist.
    // A filter narrows the audience, so dropping it silently would mail MORE
    // people than the sender chose — refuse instead. 'none' changes nothing,
    // so that one drops through and the send proceeds as it always did.
    if (error && isMissingBehaviorFilterColumn(error)) {
      if (behaviorFilter !== 'none') {
        throw new CampaignDeliveryError(
          `Targeting "${behaviorFilterLabel(behaviorFilter)}" needs database setup first. Run add-campaign-behavior-filter.sql, then try again.`,
          503,
        );
      }
      const { behavior_filter: _droppedBehavior, ...withoutBehavior } = row;
      ({ error } = await supabase.from('email_campaigns').update(withoutBehavior).eq('id', campaign.id));
      if (!error) {
        console.warn('[Campaign delivery] behavior_filter column missing; run add-campaign-behavior-filter.sql to enable behavioural targeting.');
        return { ...campaign, audience_scope: scope, include_leads: includeLeads, target_tags: targetTags, behavior_filter: 'none' };
      }
    }

    // Until add-campaign-audience-scope.sql is run the column does not exist.
    // Save what we can rather than refusing to send: without the column the
    // send falls back to the old two-way choice, which is what it did before.
    if (error && isMissingAudienceScopeColumn(error)) {
      // Without the column the scope cannot be stored, and "leads" would be
      // read back as include_leads=true — i.e. EVERYONE. Refuse rather than
      // quietly mail a wider audience than the sender chose.
      if (scope === 'leads' || scope === 'non_subscribers') {
        throw new CampaignDeliveryError(
          'Sending to CRM leads only needs database setup first. Run add-campaign-audience-scope.sql, then try again.',
          503,
        );
      }
      const { audience_scope: _dropped, ...legacyRow } = row;
      ({ error } = await supabase.from('email_campaigns').update(legacyRow).eq('id', campaign.id));
      if (!error) {
        console.warn('[Campaign delivery] audience_scope column missing; run add-campaign-audience-scope.sql to enable "CRM leads only".');
        return { ...campaign, include_leads: includeLeads, target_tags: targetTags, behavior_filter: behaviorFilter };
      }
    }
    if (error) throw new CampaignDeliveryError(`Unable to save the campaign audience before sending: ${error.message}`, 503);
  }

  return { ...campaign, audience_scope: scope, include_leads: includeLeads, target_tags: targetTags, behavior_filter: behaviorFilter };
}

// orders.customer_email is not normalised on insert — the card-payment and
// ShieldHubPay paths both store whatever case the customer typed. A server-side
// `in` against lowercased addresses would therefore miss real orders and quietly
// drop paying customers out of "has ordered before", so the column is read and
// matched case-insensitively here instead.
const ORDER_EMAIL_CAP = 50000;
const EVENT_PAGE_SIZE = 1000;

async function loadOrderEmails(supabase) {
  const { data, error } = await supabase
    .from('orders')
    .select('customer_email')
    .not('customer_email', 'is', null)
    .limit(ORDER_EMAIL_CAP);

  if (error) {
    throw new CampaignDeliveryError(
      `Order history could not be read, so order-based targeting cannot be resolved: ${error.message}`,
      503,
    );
  }
  if ((data || []).length >= ORDER_EMAIL_CAP) {
    // Silently truncating would mail the wrong list: real customers would look
    // like prospects. Refuse rather than guess.
    throw new CampaignDeliveryError(
      'Too many orders to resolve order-based targeting reliably. Use a different audience filter.',
      503,
    );
  }
  return data || [];
}

/**
 * Load only the history the chosen filter actually needs.
 *
 * "none" is the default and by far the common case, so it must cost nothing.
 * Engagement and order history are each skipped unless a filter depends on it.
 */
async function loadBehaviorSignals(supabase, behaviorFilter, targets) {
  if (normalizeBehaviorFilter(behaviorFilter) === 'none') return null;

  const subscriberIds = targets.map(item => item.id).filter(Boolean);
  const subscriberEmails = new Map(targets.map(item => [item.id, item.email]));
  if (!subscriberIds.length) return new Map();

  const wantsEngagement = behaviorNeedsEngagement(behaviorFilter);
  const wantsOrders = behaviorNeedsOrders(behaviorFilter);

  // Nothing older than the widest window can change any answer: 'engaged' and
  // 'clicked' look back 90 days, and 'dormant' only asks whether anything
  // happened inside 180. Bounding the read here is both cheaper and exact.
  const since = new Date(Date.now() - DORMANT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Chunked because Supabase caps the size of an `in` list, and the audience
  // can be the whole subscriber table.
  const chunk = (list, size = 500) => {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  };

  // Paged explicitly: PostgREST applies its own row ceiling to an unbounded
  // select, and a truncated read here would show up as people wrongly counted
  // dormant — i.e. a win-back campaign mailing subscribers who are active.
  const gather = async (table, column, values) => {
    const rows = [];
    for (const slice of chunk(values)) {
      for (let from = 0; ; from += EVENT_PAGE_SIZE) {
        const { data, error } = await supabase
          .from(table)
          .select('subscriber_id, created_at')
          .in(column, slice)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .range(from, from + EVENT_PAGE_SIZE - 1);
        if (error) {
          throw new CampaignDeliveryError(
            `Behavioural targeting needs ${table}, which could not be read: ${error.message}`,
            503,
          );
        }
        rows.push(...(data || []));
        if ((data || []).length < EVENT_PAGE_SIZE) break;
      }
    }
    return rows;
  };

  const [opens, clicks, orders] = await Promise.all([
    wantsEngagement ? gather('campaign_opens', 'subscriber_id', subscriberIds) : [],
    wantsEngagement ? gather('campaign_clicks', 'subscriber_id', subscriberIds) : [],
    wantsOrders ? loadOrderEmails(supabase) : [],
  ]);

  return buildBehaviorSignals({ opens, clicks, orders, subscriberEmails });
}

export async function deliverCampaign(campaignId, options = {}) {
  const { isTestBatch = false, sendWinner = false, winnerVariant = 'A', audience = null } = options;
  const smtp = getCampaignSmtpConfig();
  const supabase = getSupabaseAdmin();
  const { data: loadedCampaign, error: campaignError } = await supabase.from('email_campaigns').select('*').eq('id', campaignId).single();
  if (campaignError || !loadedCampaign) throw new CampaignDeliveryError('Campaign not found', 404);
  let campaign = loadedCampaign;
  if (!campaign.subject_line || !campaign.html_content) throw new CampaignDeliveryError('Campaign must have a subject and saved email body before sending', 400);
  if (!smtp.configured) throw new CampaignDeliveryError('Campaign email sender credentials are not configured', 500);
  if (!isElasticCampaignSmtp(smtp)) throw new CampaignDeliveryError('Campaign email sender must use Elastic Email', 500);
  if (campaign.status === 'sending') throw new CampaignDeliveryError('Campaign is already sending', 409);
  if (campaign.status === 'sent' && !sendWinner) throw new CampaignDeliveryError('Campaign was already sent. Duplicate it before sending again.', 409);
  if (campaign.status === 'testing' && campaign.is_ab_test && !sendWinner) throw new CampaignDeliveryError('A/B test is in progress. Pick a winner before sending the remaining subscribers.', 409);
  if (campaign.status === 'scheduled' && campaign.scheduled_for && new Date(campaign.scheduled_for).getTime() > Date.now()) {
    throw new CampaignDeliveryError(`Campaign is scheduled for ${new Date(campaign.scheduled_for).toLocaleString()}`, 409);
  }

  if (audience && !sendWinner) campaign = await applyAudienceSelection(supabase, campaign, audience);

  const audienceScope = normalizeAudienceScope(campaign.audience_scope, campaign.include_leads);
  let leadEmails = null;
  if (scopeIncludesLeads(audienceScope)) {
    ({ leadEmails } = await addCampaignLeadSubscribers(supabase));
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
  // Every group is a slice of email_subscribers, because a lead's address is
  // copied in there before it can be mailed. See subscriberMatchesScope for how
  // the four are told apart — notably "leads" matches on the address while
  // "non_subscribers" matches on the source stamp, so someone who signed up
  // AND is a lead counts for the first but not the second.
  if (audienceScope !== 'all') {
    const before = targets.length;
    targets = targets.filter(item => subscriberMatchesScope(
      item,
      audienceScope,
      leadEmails ? leadEmails.has(String(item.email || '').trim().toLowerCase()) : false,
    ));
    if (!targets.length) {
      const label = AUDIENCE_LABELS[audienceScope] || audienceScope;
      throw new CampaignDeliveryError(`No recipient matches "${label}" for this campaign (checked ${before} address${before === 1 ? '' : 'es'}).`, 400);
    }
  }
  if (!targets.length) throw new CampaignDeliveryError('Every subscriber in this segment is suppressed.', 400);

  // Behavioural targeting narrows whatever the scope produced. It runs after
  // scope and suppression so it can only ever remove people, never reach past
  // either into someone who was already excluded.
  const behaviorFilter = normalizeBehaviorFilter(campaign.behavior_filter);
  if (behaviorFilter !== 'none') {
    const before = targets.length;
    const signals = await loadBehaviorSignals(supabase, behaviorFilter, targets);
    targets = targets.filter(item => matchesBehaviorFilter(behaviorFilter, signalsFor(signals, item.email)));
    if (!targets.length) {
      throw new CampaignDeliveryError(
        `No recipient matches "${behaviorFilterLabel(behaviorFilter)}" for this campaign (checked ${before} address${before === 1 ? '' : 'es'}).`,
        400,
      );
    }
  }

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

  const safety = getCampaignSafetyConfig();
  const primaryProvider = identifyCampaignSmtpProvider(smtp.host);
  const fallbackProvider = null;
  const remainingBeforeBatch = targets.length;
  const batchTargets = targets.slice(0, safety.batchSize);

  const claimedStatus = isTestBatch ? 'testing' : 'sending';
  const { data: claimed, error: claimError } = await supabase.from('email_campaigns')
    .update({
      status: claimedStatus,
      scheduled_for: null,
      sent_at: campaign.sent_at || new Date().toISOString(),
      // Stamped so the cron can tell a live batch from one whose function died.
      updated_at: new Date().toISOString(),
    })
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
    fallback_host: null,
  });

  const transporter = createCampaignTransporter(smtp, safety);
  let sent = 0;
  let failed = 0;
  let bounced = 0;
  let lastError = null;
  let stoppedOnTimeBudget = false;
  const providerErrors = [];
  const sendDeadlineAt = Date.now() + safety.sendBudgetMs;

  try {
    for (let index = 0; index < batchTargets.length; index += 1) {
      if (index > 0 && Date.now() >= sendDeadlineAt) {
        stoppedOnTimeBudget = true;
        console.warn('[Campaign delivery] Stopping batch early to stay inside the function time limit', { campaignId: campaign.id, sentSoFar: sent, batchSize: batchTargets.length });
        break;
      }
      const subscriber = batchTargets[index];
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
          throw primaryError;
        }
        const { error } = await supabase.from('campaign_sends').insert({ campaign_id: campaign.id, subscriber_id: subscriber.id, subject_variant: variant });
        if (error) throw error;
        sent += 1;
      } catch (error) {
        if (classifySmtpFailure(error) === 'hard') {
          bounced += 1;
          await retireBouncedRecipient(supabase, subscriber, error);
        } else {
          failed += 1;
        }
        lastError = truncateError(error);
        console.error('[Campaign delivery] Subscriber send failed', { campaignId: campaign.id, subscriberId: subscriber.id, error: error.message });
      }
      if (index < batchTargets.length - 1) {
        await wait(safety.sendDelayMs);
      }
    }
  } finally {
    await closeTransporter(transporter);
  }

  // Retired addresses are gone for good, so they leave the denominator rather
  // than sitting in `remaining` and keeping the campaign stuck at "scheduled".
  const reachableEligible = Math.max(totalEligible - bounced, 0);
  const sentTotal = alreadySent + sent;
  const remaining = Math.max(reachableEligible - sentTotal, 0);
  const madeNoProgress = sent === 0 && bounced === 0 && failed > 0;
  const nextBatchMinutes = madeNoProgress
    ? Math.max(safety.batchIntervalMinutes, NO_PROGRESS_RETRY_MINUTES)
    : safety.batchIntervalMinutes;
  const nextBatchAt = !isTestBatch && remaining > 0
    ? new Date(Date.now() + nextBatchMinutes * 60 * 1000).toISOString()
    : null;
  const nextStatus = isTestBatch ? 'testing' : remaining > 0 ? 'scheduled' : sentTotal > 0 ? 'sent' : 'draft';
  await supabase
    .from('email_campaigns')
    .update({ status: nextStatus, scheduled_for: nextBatchAt, updated_at: new Date().toISOString() })
    .eq('id', campaign.id);

  const healthStatus = failed === 0 ? 'completed' : sent > 0 ? 'partial' : 'failed';
  await updateDeliveryBatchLog(supabase, batchLogId, {
    status: healthStatus,
    completed_at: new Date().toISOString(),
    sent,
    failed,
    bounced,
    remaining_after_batch: remaining,
    fallback_used: false,
    error_message: lastError,
    provider_errors: providerErrors.length ? providerErrors.slice(-10) : null,
  });

  return {
    campaignId,
    provider: primaryProvider,
    fallbackProvider,
    fallbackUsed: false,
    batchSize: safety.batchSize,
    batchIntervalMinutes: safety.batchIntervalMinutes,
    fallbackSendDelayMs: safety.fallbackSendDelayMs,
    targeted: batchTargets.length,
    stoppedOnTimeBudget,
    includeLeads: Boolean(campaign.include_leads),
    totalEligible: reachableEligible,
    alreadySent,
    sentTotal,
    remainingBeforeBatch,
    remaining,
    sent,
    failed,
    bounced,
    nextBatchAt,
    completed: remaining === 0,
  };
}
