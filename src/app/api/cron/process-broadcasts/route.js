import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic'; // Prevent caching so cron runs accurately

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

async function sendWhatsApp(to, message) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return false;
  
  let formatted = to.replace(/[^0-9]/g, '');
  if (!formatted.startsWith('506') && formatted.length === 8) {
    formatted = '506' + formatted;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formatted,
        type: 'text',
        text: { body: message }
      })
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function sendEmail(to, message, subject) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return false;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false }
    });

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

    const res = await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'info@peptidescostarica.net',
      from: `Peptides Costa Rica <info@peptidescostarica.net>`,
      to: to.trim(),
      subject: subject || 'Flash Sale! Exclusive Offer Inside',
      text: message,
      html: htmlMessage
    });
    return !!res.messageId;
  } catch (err) {
    return false;
  }
}

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    // 2. Mark as processing to prevent duplicate runs
    const ids = broadcasts.map(b => b.id);
    await supabase.from('scheduled_broadcasts').update({ status: 'processing' }).in('id', ids);

    // 3. Process each broadcast
    let totalSent = 0;

    for (const broadcast of broadcasts) {
      const targets = new Map();
      const { audience, channels, message, custom_contacts } = broadcast;

      if (audience === 'all_customers' || audience === 'all_leads') {
        const { data: orders } = await supabase.from('orders').select('customer_phone, customer_email').neq('status', 'cancelled');
        orders?.forEach(o => {
          const key = o.customer_phone || o.customer_email;
          if (key && !targets.has(key)) targets.set(key, { phone: o.customer_phone, email: o.customer_email });
        });
      }

      if (audience === 'abandoned_carts' || audience === 'all_leads') {
        const { data: carts } = await supabase.from('abandoned_carts').select('phone, email');
        carts?.forEach(c => {
          const key = c.phone || c.email;
          if (key && !targets.has(key)) targets.set(key, { phone: c.phone, email: c.email });
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

      for (let i = 0; i < batchContacts.length; i++) {
        const contact = batchContacts[i];
        await new Promise(r => setTimeout(r, 20)); 
        let sentWhatsapp = false;
        let sentEmail = false;

        if (channels.whatsapp && contact.phone) {
          sentWhatsapp = await sendWhatsApp(contact.phone, message, channels.whatsappTemplateName, contact.name, channels.whatsappTemplateLanguage);
        }
        if (channels.email && contact.email && message) {
          sentEmail = await sendEmail(contact.email, message, channels.emailSubject);
        }
        if (sentWhatsapp || sentEmail) queuedCount++;
      }

      totalSent += queuedCount;

      if (remainingContacts.length > 0) {
        // Re-queue the remaining contacts
        const remainingStr = remainingContacts.map(c => {
          if (c.phone && c.email) return `${c.phone}|${c.email}`;
          if (c.phone) return `${c.phone}`;
          if (c.email) return `${c.email}`;
          return '';
        }).filter(Boolean).join(',');

        await supabase.from('scheduled_broadcasts').update({ 
          status: 'pending',
          audience: 'custom',
          custom_contacts: remainingStr
        }).eq('id', broadcast.id);

        // Immediately trigger the next run asynchronously
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        fetch(`${protocol}://${host}/api/cron/process-broadcasts`, {
          method: 'GET',
          headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` }
        }).catch(() => {});

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
