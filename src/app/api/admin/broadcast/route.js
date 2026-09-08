import { NextResponse } from 'next/server';
import { writeDroppingMissingColumns, BROADCAST_PACING_COLUMNS, BROADCAST_WINDOW_COLUMNS } from '@/lib/optionalColumns.mjs';
import {
  DEFAULT_BATCH_SIZE, DEFAULT_DELAY_SECONDS, MAX_BATCH_SIZE, MAX_DELAY_SECONDS,
} from '@/lib/broadcastPacing.mjs';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getCampaignSmtpConfig } from '@/lib/campaignSmtp';
import { applyMarketingEmailFooter } from '@/lib/marketingEmailFooter';
import { createEmailUnsubscribeToken } from '@/lib/marketingTokens';
import { clampOutlookButtonSizes } from '@/lib/emailHtmlSafety';
import { LIVE_SITE_URL } from '@/lib/publicUrl';
import { buildTemplateParameters } from '@/lib/broadcastTemplateParam.mjs';
import { marketingCopyHeader } from '@/lib/marketingEmailAddressing.mjs';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || LIVE_SITE_URL;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper for sending WhatsApp via the official graph API
async function sendWhatsApp(to, message, templateName = null, firstName = null, languageCode = 'es', greetingVariable = false, parameterMode = null, templateParameters = null) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.warn('[Broadcast] WhatsApp credentials missing');
    return false;
  }
  
  // Format number
  let formatted = to.replace(/[^0-9]/g, '');
  if (!formatted.startsWith('506') && formatted.length === 8) {
    formatted = '506' + formatted;
  }

  try {
    let payload = {
      messaging_product: 'whatsapp',
      to: formatted,
      type: 'text',
      text: { body: message }
    };

    if (templateName) {
      payload = {
        messaging_product: 'whatsapp',
        to: formatted,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode || 'es' },
          components: [
            {
              type: 'body',
              parameters: buildTemplateParameters(
                firstName,
                languageCode,
                greetingVariable,
                message,
                parameterMode,
                templateParameters,
              ).map((text) => ({ type: 'text', text }))
            }
          ]
        }
      };
    }

    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

let globalTransporter = null;

// Helper for sending Emails
async function sendEmail(to, message, subject, imageUrl = null, htmlContent = null) {
  const productImage = imageUrl ? String(imageUrl).trim().replace(/["'<>]/g, '') : null;
  const smtp = getCampaignSmtpConfig();
  if (!smtp.configured) return false;

  try {
    if (!globalTransporter) {
      globalTransporter = nodemailer.createTransport({
        pool: true,
        maxConnections: 5,
        maxMessages: 200,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        }
      });
    }

    const htmlMessage = htmlContent ? clampOutlookButtonSizes(htmlContent) : `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="140" height="118" style="display:block;width:140px;height:118px;margin:0 auto 16px auto;border-radius:12px;">
        </div>
${productImage ? `<div style="text-align: center; margin: 0 0 24px;"><img src="${productImage}" alt="" width="220" style="max-width: 220px; width: 220px; height: auto; border: 0;" /></div>` : ''}
        <div style="color: #334155; line-height: 1.6; font-size: 16px; margin-bottom: 32px; white-space: pre-wrap;">
          ${message.replace(/\n/g, '<br>')}
        </div>
        <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
          <a href="https://catalog.peptidescostarica.net/catalog" style="display: inline-block; background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(5, 150, 105, 0.2);">
            View Catalog / Ver Catálogo
          </a>
        </div>
      </div>
    `;

    // Same unsubscribe treatment the real (cron) sends get, so a test email
    // is representative: visible footer link + one-click headers.
    const unsubscribeToken = encodeURIComponent(createEmailUnsubscribeToken(to));
    const unsubscribePageUrl = `${BASE_URL}/unsubscribe?t=${unsubscribeToken}`;
    const unsubscribeApiUrl = `${BASE_URL}/api/unsubscribe?t=${unsubscribeToken}`;
    const htmlWithFooter = applyMarketingEmailFooter(htmlMessage, {
      domain: BASE_URL,
      unsubscribeUrl: unsubscribePageUrl,
      preferencesUrl: unsubscribePageUrl,
      viewEmailUrl: BASE_URL,
    });

    const res = await globalTransporter.sendMail({
      ...marketingCopyHeader('bcc', process.env.BCC_EMAIL || 'info@peptidescostarica.net'),
      from: smtp.from,
      replyTo: smtp.replyTo,
      to: to.trim(),
      subject: subject || 'Flash Sale! Exclusive Offer Inside',
      text: message,
      html: htmlWithFooter,
      headers: {
        'List-Unsubscribe': `<${unsubscribeApiUrl}>, <mailto:${smtp.replyTo}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }
    });
    return !!res.messageId;
  } catch (err) {
    console.error('Email send failed:', err);
    return false;
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    
    await supabase
      .from('deals')
      .update({ announcement_status: 'cancelled', broadcast_id: null })
      .eq('broadcast_id', id);
    const { error } = await supabase.from('scheduled_broadcasts').delete().eq('id', id);
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete Broadcast Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** A whole CR hour 0-23, or null for "no restriction". */
function clampHour(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.floor(Number(value));
  // 24 is a valid end: "midnight, end of day". readSendWindow treats 0 -> 24
  // as no restriction at all.
  if (!Number.isFinite(n) || n < 0 || n > 24) return null;
  return n;
}

/** Keep a hand-made API call from turning a typo into a burst. */
function clampPacing(value, fallback, min, max) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function collectBroadcastTargets(audience, customContacts) {
  const targets = new Map();

  if (audience === 'all_customers' || audience === 'all_leads' || audience === 'leads_7_days') {
    let query = supabase.from('orders').select('customer_phone, customer_email, customer_name').neq('status', 'cancelled');
    if (audience === 'leads_7_days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      query = query.gte('created_at', sevenDaysAgo.toISOString());
    }
    const { data: orders, error: ordersError } = await query;
    if (ordersError) throw new Error(`Order audience lookup failed: ${ordersError.message}`);
    orders?.forEach(o => {
      const key = o.customer_phone || o.customer_email;
      if (key && !targets.has(key)) {
        const name = o.customer_name ? o.customer_name.split(' ')[0] : 'Customer';
        targets.set(key, { phone: o.customer_phone, email: o.customer_email, name });
      }
    });
  }

  if (audience === 'abandoned_carts' || audience === 'all_leads' || audience === 'leads_7_days') {
    let query = supabase.from('abandoned_carts').select('customer_phone, customer_email, customer_name').eq('status', 'active');
    if (audience === 'leads_7_days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      query = query.gte('created_at', sevenDaysAgo.toISOString());
    }
    const { data: carts, error: cartsError } = await query;
    if (cartsError) throw new Error(`Abandoned cart audience lookup failed: ${cartsError.message}`);
    carts?.forEach(c => {
      const key = c.customer_phone || c.customer_email;
      if (key && !targets.has(key)) {
        const fname = c.customer_name ? c.customer_name.split(' ')[0] : 'Customer';
        targets.set(key, { phone: c.customer_phone, email: c.customer_email, name: fname });
      }
    });

    let leadsQuery = supabase.from('catalog_leads').select('contact_value, contact_method');
    if (audience === 'leads_7_days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      leadsQuery = leadsQuery.gte('created_at', sevenDaysAgo.toISOString());
    }
    const { data: catalogLeads, error: leadsError } = await leadsQuery;
    if (leadsError) throw new Error(`Catalog lead audience lookup failed: ${leadsError.message}`);
    catalogLeads?.forEach(cl => {
      if (!targets.has(cl.contact_value)) {
        targets.set(cl.contact_value, {
          phone: cl.contact_method === 'whatsapp' ? cl.contact_value : null,
          email: cl.contact_method === 'email' ? cl.contact_value : null,
          name: 'Customer'
        });
      }
    });
  }

  // Everyone who ticked the WhatsApp consent box. The per-number opt-in gate
  // in the processor still runs; this simply lets the operator target the
  // opted-in list directly instead of broadcasting to "Everyone" and having
  // most of it discarded.
  if (audience === 'whatsapp_optins') {
    const { data: optedIn, error: optInError } = await supabase
      .from('catalog_leads')
      .select('contact_value, contact_method')
      .eq('whatsapp_consent', true);
    if (optInError) throw new Error(`WhatsApp opt-in audience lookup failed: ${optInError.message}`);
    optedIn?.forEach((lead) => {
      const key = lead.contact_value;
      if (!key || targets.has(key)) return;
      const isEmail = String(key).includes('@');
      targets.set(key, { phone: isEmail ? null : key, email: isEmail ? key : null, name: null });
    });
  }

  if (audience === 'custom' && customContacts) {
    const contactsList = customContacts.split(/[\n,]+/).map(c => c.trim()).filter(Boolean);
    contactsList.forEach(c => {
      if (c.includes('|')) {
        const [phone, email] = c.split('|');
        targets.set(c, { phone: phone || null, email: email || null });
      } else {
        const isEmail = c.includes('@');
        targets.set(c, {
          phone: isEmail ? null : c,
          email: isEmail ? c : null
        });
      }
    });
  }

  return targets;
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('estimate') !== '1') {
      return NextResponse.json({ error: 'Unknown broadcast action' }, { status: 400 });
    }

    const audience = searchParams.get('audience') || 'all_customers';
    const customContacts = searchParams.get('customContacts') || '';
    const targets = await collectBroadcastTargets(audience, customContacts);
    const contacts = Array.from(targets.values());

    return NextResponse.json({
      success: true,
      audience,
      totalTargets: contacts.length,
      whatsappTargets: contacts.filter(contact => !!contact.phone).length,
      emailTargets: contacts.filter(contact => !!contact.email).length
    });
  } catch (err) {
    console.error('Broadcast Estimate Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  try {
    const { audience, channels, message, testContact, customContacts, scheduledAt, enableBatching, whatsappTemplateName, whatsappTemplateLanguage, dealId, pacing } = await request.json();

    // The operator's chosen speed, clamped here as well as in the processor so
    // a hand-made API call cannot queue a 10,000-message burst.
    const pacingColumns = {
      email_batch_size: clampPacing(pacing?.emailBatchSize, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE),
      email_batch_delay_seconds: clampPacing(pacing?.emailDelaySeconds, DEFAULT_DELAY_SECONDS, 0, MAX_DELAY_SECONDS),
      whatsapp_batch_size: clampPacing(pacing?.whatsappBatchSize, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE),
      whatsapp_batch_delay_seconds: clampPacing(pacing?.whatsappDelaySeconds, DEFAULT_DELAY_SECONDS, 0, MAX_DELAY_SECONDS),
      // Quiet hours, in Costa Rica time. Equal start and end would mean a
      // zero-length window that never opens, so it is treated as "no limit".
      send_window_start_hour: clampHour(pacing?.windowStartHour),
      send_window_end_hour: clampHour(pacing?.windowEndHour),
    };
    if (pacingColumns.send_window_start_hour === pacingColumns.send_window_end_hour) {
      pacingColumns.send_window_start_hour = null;
      pacingColumns.send_window_end_hour = null;
    }

    if (!message && !whatsappTemplateName && !(channels?.email && channels?.emailHtmlContent)) {
      return NextResponse.json({ error: 'Message, Template Name, or custom email HTML is required' }, { status: 400 });
    }
    if (audience !== 'test' && channels?.whatsapp && !whatsappTemplateName) {
      return NextResponse.json({
        error: 'An approved WhatsApp marketing template is required for broadcasts outside the 24-hour customer-service window.',
      }, { status: 400 });
    }
    if (channels?.whatsapp && whatsappTemplateName && channels?.whatsappTemplateParamMode === 'message' && !String(message || '').trim()) {
      return NextResponse.json({ error: 'This WhatsApp template expects the Message Composer text in {{1}}.' }, { status: 400 });
    }
    if (
      channels?.whatsapp
      && whatsappTemplateName
      && channels?.whatsappTemplateParamMode === 'custom'
      && (
        !Array.isArray(channels.whatsappTemplateParameters)
        || channels.whatsappTemplateParameters.length === 0
        || channels.whatsappTemplateParameters.some((value) => !String(value || '').trim())
      )
    ) {
      return NextResponse.json({ error: 'Fill every approved WhatsApp template field before sending.' }, { status: 400 });
    }

    if (scheduledAt && audience !== 'test') {
      const payload = {
        audience,
        custom_contacts: customContacts || null,
        channels: { 
          ...channels, 
          whatsappTemplateName: whatsappTemplateName || null, 
          whatsappTemplateLanguage: whatsappTemplateLanguage || null 
        },
        message: message || '',
        scheduled_at: scheduledAt,
        status: 'pending',
        deal_id: dealId || null,
        ...pacingColumns,
      };
      const { data: inserted, error } = await writeDroppingMissingColumns(
        payload,
        ['deal_id', ...BROADCAST_PACING_COLUMNS, ...BROADCAST_WINDOW_COLUMNS],
        (row) => supabase.from('scheduled_broadcasts').insert(row).select('id').single(),
      );
      if (error) throw error;
      if (dealId) {
        await supabase.from('deals').update({
          broadcast_id: inserted.id,
          announcement_status: 'scheduled',
        }).eq('id', dealId);
      }
      return NextResponse.json({ success: true, text: 'Broadcast scheduled successfully', queuedCount: 1 });
    }

    let targets = new Map(); // Use Map to deduplicate by phone/email

    if (audience === 'test' && testContact) {
       const isEmail = testContact.includes('@');
       targets.set(testContact, { 
         phone: isEmail ? null : testContact, 
         email: isEmail ? testContact : null 
       });
    } else {
      targets = await collectBroadcastTargets(audience, customContacts);
    } // Close the else block

    const contacts = Array.from(targets.values());
    
    // Queue every non-test marketing send so suppression, idempotency, retries,
    // and per-recipient delivery events are enforced in one durable path.
    if (contacts.length > 0 && audience !== 'test') {
      const allContactStrs = contacts.map(c => {
        if (c.phone && c.email) return `${c.phone}|${c.email}`;
        if (c.phone) return `${c.phone}`;
        if (c.email) return `${c.email}`;
        return '';
      }).filter(Boolean).join(',');

      const payload = {
        audience: 'custom',
        custom_contacts: allContactStrs,
        channels: { 
          ...channels, 
          whatsappTemplateName: whatsappTemplateName || null, 
          whatsappTemplateLanguage: whatsappTemplateLanguage || null 
        },
        message: message || '',
        scheduled_at: new Date().toISOString(),
        status: 'pending',
        deal_id: dealId || null,
        ...pacingColumns,
      };
      const { data: inserted, error: insertError } = await writeDroppingMissingColumns(
        payload,
        ['deal_id', ...BROADCAST_PACING_COLUMNS, ...BROADCAST_WINDOW_COLUMNS],
        (row) => supabase.from('scheduled_broadcasts').insert(row).select().single(),
      );

      if (insertError) throw insertError;

      if (dealId) {
        await supabase.from('deals').update({
          broadcast_id: inserted.id,
          announcement_status: 'queued',
        }).eq('id', dealId);
      }

      // Trigger the processor asynchronously
      const host = request.headers.get('host') || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      fetch(`${protocol}://${host}/api/cron/process-broadcasts`, {
        method: 'GET',
        headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` }
      }).catch(() => {});

      return NextResponse.json({ success: true, queuedCount: contacts.length, text: `Queued ${contacts.length} recipients for safe background delivery.` });
    }

    let queuedCount = 0;

    const promises = contacts.map(async (contact, i) => {
      // Add artificial delay to avoid hitting rate limits instantly
      await new Promise(r => setTimeout(r, i * 20)); 
      
      let sentWhatsapp = false;
      let sentEmail = false;

      if (channels.whatsapp && contact.phone) {
        sentWhatsapp = await sendWhatsApp(
          contact.phone,
          message,
          whatsappTemplateName,
          contact.name,
          whatsappTemplateLanguage,
          channels?.whatsappGreetingVariable,
          channels?.whatsappTemplateParamMode,
          channels?.whatsappTemplateParameters,
        );
      }
      
      if (channels.email && contact.email && (message || channels.emailHtmlContent)) {
        sentEmail = await sendEmail(contact.email, message, channels.emailSubject, channels.emailImageUrl || null, channels.emailHtmlContent || null);
      }

      if (sentWhatsapp || sentEmail) queuedCount++;
    });

    await Promise.all(promises);

    let resMessage = 'Broadcast completed successfully.';

    return NextResponse.json({ success: true, queuedCount, text: resMessage });
  } catch (err) {
    console.error('Broadcast Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
