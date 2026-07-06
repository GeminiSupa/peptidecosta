import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// Helper for sending WhatsApp via the official graph API
async function sendWhatsApp(to, message, templateName = null, firstName = 'Customer', languageCode = 'es') {
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
              parameters: [
                {
                  type: 'text',
                  text: firstName || 'Customer'
                }
              ]
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
async function sendEmail(to, message, subject) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return false;

  try {
    if (!globalTransporter) {
      globalTransporter = nodemailer.createTransport({
        pool: true,
        maxConnections: 5,
        maxMessages: 200,
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    }

    const htmlMessage = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="https://catalog.peptidescostarica.net/logo.png" alt="Peptides Costa Rica" style="max-height: 60px; border-radius: 8px; background: #0f172a; padding: 8px;" />
        </div>
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

    const res = await globalTransporter.sendMail({
      bcc: process.env.BCC_EMAIL || 'info@peptidescostarica.net',
      from: `Peptides Costa Rica <info@peptidescostarica.net>`,
      to: to.trim(),
      subject: subject || 'Flash Sale! Exclusive Offer Inside',
      text: message,
      html: htmlMessage
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
    
    const { error } = await supabase.from('scheduled_broadcasts').delete().eq('id', id);
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete Broadcast Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  try {
    const { audience, channels, message, testContact, customContacts, scheduledAt, enableBatching, whatsappTemplateName, whatsappTemplateLanguage } = await request.json();

    if (!message && !whatsappTemplateName) {
      return NextResponse.json({ error: 'Message or Template Name is required' }, { status: 400 });
    }

    if (scheduledAt && audience !== 'test') {
      const { error } = await supabase.from('scheduled_broadcasts').insert({
        audience,
        custom_contacts: customContacts || null,
        channels: { 
          ...channels, 
          whatsappTemplateName: whatsappTemplateName || null, 
          whatsappTemplateLanguage: whatsappTemplateLanguage || null 
        },
        message: message || '',
        scheduled_at: scheduledAt,
        status: 'pending'
      });
      if (error) throw error;
      return NextResponse.json({ success: true, text: 'Broadcast scheduled successfully', queuedCount: 1 });
    }

    const targets = new Map(); // Use Map to deduplicate by phone/email

    if (audience === 'test' && testContact) {
       const isEmail = testContact.includes('@');
       targets.set(testContact, { 
         phone: isEmail ? null : testContact, 
         email: isEmail ? testContact : null 
       });
    } else {

    if (audience === 'all_customers' || audience === 'all_leads' || audience === 'leads_7_days') {
      let query = supabase.from('orders').select('customer_phone, customer_email, customer_name').neq('status', 'cancelled');
      if (audience === 'leads_7_days') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        query = query.gte('created_at', sevenDaysAgo.toISOString());
      }
      const { data: orders } = await query;
      orders?.forEach(o => {
        const key = o.customer_phone || o.customer_email;
        if (key && !targets.has(key)) {
          const name = o.customer_name ? o.customer_name.split(' ')[0] : 'Customer';
          targets.set(key, { phone: o.customer_phone, email: o.customer_email, name });
        }
      });
    }

    if (audience === 'abandoned_carts' || audience === 'all_leads' || audience === 'leads_7_days') {
      let query = supabase.from('abandoned_carts').select('phone, email, name').eq('status', 'active');
      if (audience === 'leads_7_days') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        query = query.gte('created_at', sevenDaysAgo.toISOString());
      }
      const { data: carts } = await query;
      carts?.forEach(c => {
        const key = c.phone || c.email;
        if (key && !targets.has(key)) {
          const fname = c.name ? c.name.split(' ')[0] : 'Customer';
          targets.set(key, { phone: c.phone, email: c.email, name: fname });
        }
      });

      // Also pull from catalog_leads for leads_7_days/all_leads
      let leadsQuery = supabase.from('catalog_leads').select('contact_value, contact_method');
      if (audience === 'leads_7_days') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        leadsQuery = leadsQuery.gte('created_at', sevenDaysAgo.toISOString());
      }
      const { data: catalogLeads } = await leadsQuery;
      catalogLeads?.forEach(cl => {
        if (!targets.has(cl.contact_value)) {
          targets.set(cl.contact_value, {
            phone: cl.contact_method === 'whatsapp' ? cl.contact_value : null,
            email: cl.contact_method === 'email' ? cl.contact_value : null,
            name: cl.name ? cl.name.split(' ')[0] : 'Customer'
          });
        }
      });
    }

    if (audience === 'custom' && customContacts) {
       const contactsList = customContacts.split(/[\n,]+/).map(c => c.trim()).filter(Boolean);
       contactsList.forEach(c => {
         const isEmail = c.includes('@');
         targets.set(c, {
           phone: isEmail ? null : c,
           email: isEmail ? c : null
         });
       });
    }
    
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

      const { data: inserted, error: insertError } = await supabase.from('scheduled_broadcasts').insert({
        audience: 'custom',
        custom_contacts: allContactStrs,
        channels: { 
          ...channels, 
          whatsappTemplateName: whatsappTemplateName || null, 
          whatsappTemplateLanguage: whatsappTemplateLanguage || null 
        },
        message: message || '',
        scheduled_at: new Date().toISOString(),
        status: 'pending'
      }).select().single();

      if (insertError) throw insertError;

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
        sentWhatsapp = await sendWhatsApp(contact.phone, message, whatsappTemplateName, contact.name, whatsappTemplateLanguage);
      }
      
      if (channels.email && contact.email && message) {
        sentEmail = await sendEmail(contact.email, message, channels.emailSubject);
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
