import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { canRetryDelivery, isMarketingSuppressed, normalizeMarketingIdentity } from '@/lib/marketingDelivery.mjs';
import { createEmailUnsubscribeToken, createJourneyTrackingToken } from '@/lib/marketingTokens';
import { applyMarketingEmailFooter } from '@/lib/marketingEmailFooter';
import { hasWhatsAppOptIn } from '@/lib/whatsappCompliance';
import { clampOutlookButtonSizes } from '@/lib/emailHtmlSafety';
import { getCampaignSmtpConfig } from '@/lib/campaignSmtp';
import { LIVE_SITE_URL } from '@/lib/publicUrl';

export const dynamic = 'force-dynamic'; // Prevent caching so cron runs accurately

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || LIVE_SITE_URL;

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Builds the {{1}} value for a template send. Meta rejects an empty parameter,
// so a nameless contact always needs *something* readable in that slot.
//
// greetingVariable=true is for templates whose {{1}} carries the whole greeting
// (e.g. "👋 {{1}} ¡Retatrutide...") — a nameless contact then reads "¡Buenas!"
// rather than an English "Customer" stranded in a Spanish message.
// greetingVariable=false is the classic shape, where {{1}} is a bare first name
// and the greeting is baked into the template (e.g. "¡Hola {{1}}!").
function buildTemplateParam(firstName, languageCode, greetingVariable) {
  const isEn = String(languageCode || 'es').toLowerCase().startsWith('en');
  // Meta rejects parameters containing newlines/tabs, so flatten defensively.
  const name = String(firstName || '').replace(/\s+/g, ' ').trim();

  if (greetingVariable) {
    if (name) return isEn ? `Hi ${name}` : `Hola ${name}`;
    return isEn ? 'Hello!' : '¡Buenas!';
  }
  return name || (isEn ? 'Customer' : 'Cliente');
}

async function sendWhatsApp(to, message, templateName = null, firstName = null, languageCode = 'es', greetingVariable = false) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return false;
  
  let formatted = to.replace(/[^0-9]/g, '');
  if (!formatted.startsWith('506') && formatted.length === 8) {
    formatted = '506' + formatted;
  }

  try {
    const payload = templateName ? {
      messaging_product: 'whatsapp',
      to: formatted,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode || 'es' },
        components: [{
          type: 'body',
          parameters: [{ type: 'text', text: buildTemplateParam(firstName, languageCode, greetingVariable) }],
        }],
      },
    } : {
      messaging_product: 'whatsapp',
      to: formatted,
      type: 'text',
      text: { body: message },
    };

    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const responseBody = await res.json().catch(() => ({}));
    return { sent: res.ok, providerId: responseBody.messages?.[0]?.id || null };
  } catch (err) {
    return { sent: false, providerId: null };
  }
}

function addTrackingToHtml(html, tracking) {
  const safeHtml = clampOutlookButtonSizes(html);
  if (!tracking) return safeHtml;
  const trackingToken = createJourneyTrackingToken(tracking);
  const trackedHtml = String(safeHtml || '').replace(/href="([^"]+)"/g, (match, url) => {
    if (!url.startsWith('http') && !url.startsWith('/')) return match;
    const absoluteUrl = url.startsWith('/') ? `${BASE_URL}${url}` : url;
    return `href="${BASE_URL}/api/tracking/journey/click?t=${encodeURIComponent(trackingToken)}&url=${encodeURIComponent(absoluteUrl)}"`;
  });
  const trackingPixel = `<img src="${BASE_URL}/api/tracking/journey/open?t=${encodeURIComponent(trackingToken)}" width="1" height="1" alt="" style="display:block" />`;
  return trackedHtml.includes('</body>')
    ? trackedHtml.replace(/<\/body>/i, `${trackingPixel}</body>`)
    : `${trackedHtml}${trackingPixel}`;
}

async function sendEmail(to, message, subject, tracking = null, htmlContent = null, imageUrl = null) {
  // Optional product image for the default wrapper; quotes stripped so an
  // admin-pasted URL cannot break out of the src attribute.
  const productImage = imageUrl ? String(imageUrl).trim().replace(/["'<>]/g, '') : null;
  const smtp = getCampaignSmtpConfig();
  if (!smtp.configured) return false;

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass }
    });

    const trackingToken = tracking ? createJourneyTrackingToken(tracking) : null;
    const trackedHref = url => trackingToken
      ? `${BASE_URL}/api/tracking/journey/click?t=${encodeURIComponent(trackingToken)}&url=${encodeURIComponent(url)}`
      : url;
    const escapedMessage = escapeHtml(message).replace(/https?:\/\/[^\s<]+/g, url => `<a href="${trackedHref(url.replace(/&amp;/g, '&'))}" style="color:#059669;text-decoration:underline;">${url}</a>`).replace(/\n/g, '<br>');
    const trackingPixel = trackingToken ? `<img src="${BASE_URL}/api/tracking/journey/open?t=${encodeURIComponent(trackingToken)}" width="1" height="1" alt="" style="display:block" />` : '';
    const htmlMessage = htmlContent ? addTrackingToHtml(htmlContent, tracking) : `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="https://catalog.peptidescostarica.net/logo.png" alt="Peptides Costa Rica" width="140" height="118" style="display:block;width:140px;height:118px;margin:0 auto 16px auto;border-radius:12px;">
        </div>
${productImage ? `<div style="text-align: center; margin: 0 0 24px;"><img src="${productImage}" alt="" width="220" style="max-width: 220px; width: 220px; height: auto; border: 0;" /></div>` : ''}
        <div style="color: #334155; line-height: 1.6; font-size: 16px; margin-bottom: 32px; white-space: pre-wrap;">
          ${escapedMessage}
        </div>
        <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
          <a href="${trackedHref('https://catalog.peptidescostarica.net/catalog')}" style="display: inline-block; background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(5, 150, 105, 0.2);">
            View Catalog / Ver Catálogo
          </a>
        </div>
        ${trackingPixel}
      </div>
    `;

    // Every broadcast email gets a working unsubscribe: a visible footer link
    // plus the one-click headers Gmail/Yahoo require for bulk senders. The
    // token embeds the recipient's address, so it works for order customers
    // and custom lists that are not in email_subscribers.
    const unsubscribeToken = encodeURIComponent(createEmailUnsubscribeToken(to));
    const unsubscribePageUrl = `${BASE_URL}/unsubscribe?t=${unsubscribeToken}`;
    const unsubscribeApiUrl = `${BASE_URL}/api/unsubscribe?t=${unsubscribeToken}`;
    const htmlWithFooter = applyMarketingEmailFooter(htmlMessage, {
      domain: BASE_URL,
      unsubscribeUrl: unsubscribePageUrl,
      preferencesUrl: unsubscribePageUrl,
      viewEmailUrl: BASE_URL,
    });

    const res = await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'info@peptidescostarica.net',
      from: smtp.from,
      replyTo: smtp.replyTo,
      to: to.trim(),
      subject: subject || 'Flash Sale! Exclusive Offer Inside',
      text: message || '',
      html: htmlWithFooter,
      headers: {
        'List-Unsubscribe': `<${unsubscribeApiUrl}>, <mailto:${smtp.replyTo}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }
    });
    return { sent: Boolean(res.messageId), providerId: res.messageId || null };
  } catch (err) {
    return { sent: false, providerId: null };
  }
}

async function recordSuppressed(broadcastId, identity, channel, reason = 'Global marketing suppression') {
  await supabase.from('marketing_delivery_events').upsert({
    broadcast_id: broadcastId,
    contact_key: identity,
    channel,
    status: 'suppressed',
    attempt_count: 0,
    error: reason,
    last_attempt_at: new Date().toISOString(),
  }, { onConflict: 'broadcast_id,contact_key,channel' });
}

async function guardedSend({ broadcastId, identity, channel, send, suppressions }) {
  if (!identity) return { sent: false, retryable: false };
  if (isMarketingSuppressed(suppressions, identity, channel)) {
    await recordSuppressed(broadcastId, identity, channel);
    return { sent: false, retryable: false };
  }

  const { data: existing } = await supabase
    .from('marketing_delivery_events')
    .select('*')
    .eq('broadcast_id', broadcastId)
    .eq('contact_key', identity)
    .eq('channel', channel)
    .maybeSingle();

  if (!canRetryDelivery(existing)) {
    return { sent: false, retryable: false };
  }
  if (existing?.status === 'processing' && Date.now() - new Date(existing.last_attempt_at).getTime() < 10 * 60 * 1000) {
    return { sent: false, retryable: false };
  }

  const attemptCount = Number(existing?.attempt_count || 0) + 1;
  const timestamp = new Date().toISOString();
  const { error: claimError } = await supabase.from('marketing_delivery_events').upsert({
    broadcast_id: broadcastId,
    contact_key: identity,
    channel,
    status: 'processing',
    attempt_count: attemptCount,
    error: null,
    first_attempt_at: existing?.first_attempt_at || timestamp,
    last_attempt_at: timestamp,
  }, { onConflict: 'broadcast_id,contact_key,channel' });
  if (claimError) throw claimError;

  try {
    const sendResult = await send();
    const sent = typeof sendResult === 'object' ? Boolean(sendResult.sent) : Boolean(sendResult);
    const providerId = typeof sendResult === 'object' ? sendResult.providerId : null;
    await supabase.from('marketing_delivery_events').update({
      status: sent ? 'delivered' : 'failed',
      error: sent ? null : `${channel} provider rejected the message`,
      provider_id: providerId || existing?.provider_id || null,
      delivered_at: sent ? new Date().toISOString() : null,
      last_attempt_at: new Date().toISOString(),
    }).eq('broadcast_id', broadcastId).eq('contact_key', identity).eq('channel', channel);
    return { sent, retryable: !sent && attemptCount < 3 };
  } catch (error) {
    await supabase.from('marketing_delivery_events').update({
      status: 'failed', error: String(error.message || error).slice(0, 500), last_attempt_at: new Date().toISOString(),
    }).eq('broadcast_id', broadcastId).eq('contact_key', identity).eq('channel', channel);
    return { sent: false, retryable: attemptCount < 3 };
  }
}

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch pending broadcasts where scheduled_at is past
    const { data: broadcasts, error: fetchError } = await supabase
      .from('scheduled_broadcasts')
      .select('*')
      .in('status', ['pending', 'processing'])
      .lte('scheduled_at', new Date().toISOString());

    if (fetchError) throw fetchError;
    if (!broadcasts || broadcasts.length === 0) {
      return NextResponse.json({ message: 'No pending broadcasts' });
    }

    const { data: suppressionRows, error: suppressionError } = await supabase
      .from('marketing_suppressions')
      .select('identity,channel')
      .eq('active', true);
    if (suppressionError) throw suppressionError;
    const suppressions = new Set((suppressionRows || []).map(item => `${item.identity}:${item.channel}`));

    // 2. Mark as processing to prevent duplicate runs
    const ids = broadcasts.map(b => b.id);
    await supabase.from('scheduled_broadcasts').update({ status: 'processing' }).in('id', ids);

    // 3. Process each broadcast
    let totalSent = 0;

    for (const broadcast of broadcasts) {
      const targets = new Map();
      const { audience, channels, message, custom_contacts } = broadcast;

      if (audience === 'all_customers' || audience === 'all_leads' || audience === 'leads_7_days') {
        let query = supabase.from('orders').select('customer_phone, customer_email, customer_name, created_at').neq('status', 'cancelled');
        if (audience === 'leads_7_days') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          query = query.gte('created_at', sevenDaysAgo.toISOString());
        }
        const { data: orders, error: ordersError } = await query;
        if (ordersError) throw new Error(`Order audience lookup failed: ${ordersError.message}`);
        orders?.forEach(o => {
          const key = o.customer_phone || o.customer_email;
          const name = o.customer_name ? o.customer_name.split(' ')[0] : null;
          if (key && !targets.has(key)) targets.set(key, { phone: o.customer_phone, email: o.customer_email, name });
        });
      }

      if (audience === 'abandoned_carts' || audience === 'all_leads' || audience === 'leads_7_days') {
        // NOTE: these are customer_* columns — an earlier `phone, email, name`
        // select errored on every run, and because the error was discarded the
        // audience silently came back empty instead of failing loudly.
        let query = supabase.from('abandoned_carts').select('customer_phone, customer_email, customer_name, created_at').eq('status', 'active');
        if (audience === 'leads_7_days') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          query = query.gte('created_at', sevenDaysAgo.toISOString());
        }
        const { data: carts, error: cartsError } = await query;
        if (cartsError) throw new Error(`Abandoned cart audience lookup failed: ${cartsError.message}`);
        carts?.forEach(c => {
          const key = c.customer_phone || c.customer_email;
          const name = c.customer_name ? c.customer_name.split(' ')[0] : null;
          if (key && !targets.has(key)) targets.set(key, { phone: c.customer_phone, email: c.customer_email, name });
        });

        // catalog_leads has no name column — selecting one errored out here too,
        // which meant every opted-in catalog lead was silently dropped from
        // "All Leads" broadcasts.
        let leadsQuery = supabase.from('catalog_leads').select('contact_value, contact_method, created_at');
        if (audience === 'leads_7_days') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          leadsQuery = leadsQuery.gte('created_at', sevenDaysAgo.toISOString());
        }
        const { data: catalogLeads, error: leadsError } = await leadsQuery;
        if (leadsError) throw new Error(`Catalog lead audience lookup failed: ${leadsError.message}`);
        catalogLeads?.forEach(lead => {
          const key = lead.contact_value;
          if (key && !targets.has(key)) {
            targets.set(key, {
              phone: lead.contact_method === 'whatsapp' ? lead.contact_value : null,
              email: lead.contact_method === 'email' ? lead.contact_value : null,
              name: null,
            });
          }
        });
      }

      if (audience === 'custom' && custom_contacts) {
        const contactsList = custom_contacts.split(/[\n,]+/).map(c => c.trim()).filter(Boolean);
        contactsList.forEach(c => {
          if (c.includes('|')) {
            const [phone, email] = c.split('|');
            targets.set(c, { phone: phone || null, email: email || null });
          } else {
            const isEmail = c.includes('@');
            targets.set(c, { phone: isEmail ? null : c, email: isEmail ? c : null });
          }
        });
      }

      const contacts = Array.from(targets.values());
      const BATCH_SIZE = 10;
      const batchContacts = contacts.slice(0, BATCH_SIZE);
      const remainingContacts = contacts.slice(BATCH_SIZE);

      let queuedCount = 0;
      const retryContacts = [];

      for (let i = 0; i < batchContacts.length; i++) {
        const contact = batchContacts[i];
        await new Promise(r => setTimeout(r, 20)); 
        let sentWhatsapp = false;
        let sentEmail = false;
        let retryWhatsapp = false;
        let retryEmail = false;

        if (channels.whatsapp && contact.phone) {
          // OPT-IN GATE: never WhatsApp-broadcast to a number that has not
          // explicitly opted in. This is the #1 protection against Meta spam
          // flags — "All Customers"/"Everyone" audiences include people who
          // never consented to WhatsApp marketing.
          const optedIn = await hasWhatsAppOptIn(supabase, contact.phone);
          if (!optedIn) {
            await recordSuppressed(
              broadcast.id,
              normalizeMarketingIdentity(contact.phone, 'whatsapp'),
              'whatsapp',
              'No WhatsApp opt-in — skipped to protect the number'
            );
          } else {
            const result = await guardedSend({
              broadcastId: broadcast.id,
              identity: normalizeMarketingIdentity(contact.phone, 'whatsapp'),
              channel: 'whatsapp',
              suppressions,
              send: () => sendWhatsApp(contact.phone, message, channels.whatsappTemplateName, contact.name, channels.whatsappTemplateLanguage, channels.whatsappGreetingVariable),
            });
            sentWhatsapp = result.sent;
            retryWhatsapp = result.retryable;
          }
        }
        if (channels.email && contact.email && (message || channels.emailHtmlContent)) {
          const result = await guardedSend({
            broadcastId: broadcast.id,
            identity: normalizeMarketingIdentity(contact.email, 'email'),
            channel: 'email',
            suppressions,
            send: () => sendEmail(
              contact.email,
              message,
              channels.emailSubject,
              broadcast.journey_id ? {
                journeyId: broadcast.journey_id,
                enrollmentId: broadcast.journey_enrollment_id,
                broadcastId: broadcast.id,
                stepId: broadcast.journey_step_id,
                contactKey: normalizeMarketingIdentity(contact.email, 'email'),
              } : null,
              channels.emailHtmlContent || null,
              channels.emailImageUrl || null
            ),
          });
          sentEmail = result.sent;
          retryEmail = result.retryable;
        }
        if (sentWhatsapp || sentEmail) queuedCount++;
        if (retryWhatsapp || retryEmail) retryContacts.push(contact);
      }

      totalSent += queuedCount;

      const { data: latestBroadcast, error: latestBroadcastError } = await supabase
        .from('scheduled_broadcasts')
        .select('status')
        .eq('id', broadcast.id)
        .maybeSingle();
      if (latestBroadcastError) throw latestBroadcastError;
      if (latestBroadcast?.status === 'cancelled') {
        continue;
      }

      const contactsToRequeue = [...remainingContacts, ...retryContacts];
      if (contactsToRequeue.length > 0) {
        // Re-queue the remaining contacts
        const remainingStr = contactsToRequeue.map(c => {
          if (c.phone && c.email) return `${c.phone}|${c.email}`;
          if (c.phone) return `${c.phone}`;
          if (c.email) return `${c.email}`;
          return '';
        }).filter(Boolean).join(',');

        await supabase.from('scheduled_broadcasts').update({ 
          status: 'pending',
          audience: 'custom',
          custom_contacts: remainingStr,
          scheduled_at: retryContacts.length && remainingContacts.length === 0
            ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
            : new Date().toISOString()
        }).eq('id', broadcast.id);

        // Immediately trigger the next run asynchronously
        if (remainingContacts.length > 0) {
          const host = request.headers.get('host') || 'localhost:3000';
          const protocol = host.includes('localhost') ? 'http' : 'https';
          fetch(`${protocol}://${host}/api/cron/process-broadcasts`, {
            method: 'GET',
            headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` }
          }).catch(() => {});
        }

      } else {
        await supabase.from('scheduled_broadcasts').update({ status: 'completed' }).eq('id', broadcast.id);
      }
    }

    return NextResponse.json({ success: true, processed: broadcasts.length, totalSent });
  } catch (err) {
    console.error('[CRON Process Broadcasts]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
