import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// Helper for sending WhatsApp via the official graph API
async function sendWhatsApp(to, message) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
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

// Helper for sending Emails
async function sendEmail(to, message) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return false;

  try {
    const transporter = nodemailer.createTransport({
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

    const res = await transporter.sendMail({
      from: `Peptides Costa Rica <info@peptidescostarica.net>`,
      to: to.trim(),
      subject: 'Flash Sale! Exclusive Offer Inside',
      text: message
    });
    return !!res.messageId;
  } catch (err) {
    return false;
  }
}

export async function DELETE(request) {
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
  try {
    const { audience, channels, message, testContact, customContacts, scheduledAt } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (scheduledAt && audience !== 'test') {
      const { error } = await supabase.from('scheduled_broadcasts').insert({
        audience,
        custom_contacts: customContacts || null,
        channels,
        message,
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

    if (audience === 'all_customers' || audience === 'all_leads') {
      const { data: orders } = await supabase.from('orders').select('customer_phone, customer_email').neq('status', 'cancelled');
      orders?.forEach(o => {
        const key = o.customer_phone || o.customer_email;
        if (key && !targets.has(key)) {
          targets.set(key, { phone: o.customer_phone, email: o.customer_email });
        }
      });
    }

    if (audience === 'abandoned_carts' || audience === 'all_leads') {
      const { data: carts } = await supabase.from('abandoned_carts').select('phone, email');
      carts?.forEach(c => {
        const key = c.phone || c.email;
        if (key && !targets.has(key)) {
          targets.set(key, { phone: c.phone, email: c.email });
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
    let queuedCount = 0;

    // Send the broadcasts
    // Note: In production for 1000s of users, this should be pushed to a background queue
    // Since we are running in Next.js Serverless, we do it in a Promise.all block with slight concurrency control.
    const promises = contacts.map(async (contact, i) => {
      // Add artificial delay to avoid hitting rate limits instantly
      await new Promise(r => setTimeout(r, i * 150)); 
      
      let sentWhatsapp = false;
      let sentEmail = false;

      if (channels.whatsapp && contact.phone) {
        sentWhatsapp = await sendWhatsApp(contact.phone, message);
      }
      
      if (channels.email && contact.email) {
        sentEmail = await sendEmail(contact.email, message);
      }

      if (sentWhatsapp || sentEmail) queuedCount++;
    });

    // Don't await all of them if the list is huge, but Vercel timeout is 10-60s depending on plan.
    // For now we will await them all since the list is likely < 500 contacts initially.
    await Promise.all(promises);

    return NextResponse.json({ success: true, queuedCount });
  } catch (err) {
    console.error('Broadcast Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
