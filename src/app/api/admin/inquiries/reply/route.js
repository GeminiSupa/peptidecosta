import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getBusinessLinks } from '@/lib/settings';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { inquiryId, replyMessage, adminEmail } = await request.json();
    const links = await getBusinessLinks();

    if (!inquiryId || !replyMessage?.trim()) {
      return NextResponse.json({ error: 'Missing inquiryId or replyMessage' }, { status: 400 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the original inquiry to get customer details
    const { data: inquiry, error: fetchError } = await supabase
      .from('customer_inquiries')
      .select('*')
      .eq('id', inquiryId)
      .single();

    if (fetchError || !inquiry) {
      return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
    }

    // Send the reply email via SMTP
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP settings are not configured' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      }
    });

    // Build a branded email reply with the original message included
    const replyHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.03);">
        <!-- Header Banner -->
        <div style="background:linear-gradient(135deg, #0f172a, #022c22);padding:28px 24px;text-align:center;">
          <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="140" height="118" style="display:block;width:140px;height:118px;margin:0 auto 16px auto;border-radius:12px;">
          <h2 style="color:#ffffff;font-size:20px;font-weight:800;margin:0;letter-spacing:-0.5px;">Re: ${inquiry.subject || 'Your Inquiry'}</h2>
        </div>

        <!-- Greeting -->
        <div style="padding:28px 24px 8px;font-size:15px;color:#334155;">
          <p style="margin:0 0 16px;">Hi <strong>${inquiry.customer_name}</strong>,</p>
        </div>

        <!-- Reply Body -->
        <div style="padding:0 24px 24px;font-size:15px;color:#334155;">
          ${replyMessage.trim().split('\n').map(p => p.trim() ? `<p style="margin:0 0 14px;">${p}</p>` : '').join('')}
        </div>

        <!-- Original Message Quote -->
        <div style="margin:0 24px 24px;padding:16px 20px;background:#f8fafc;border-left:4px solid #10b981;border-radius:0 8px 8px 0;font-size:13px;color:#64748b;">
          <div style="font-weight:700;margin-bottom:8px;color:#475569;">Your Original Message:</div>
          <div style="white-space:pre-wrap;">${inquiry.message}</div>
        </div>

        <!-- CTA / Footer Support Block -->
        <div style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <h4 style="margin:0 0 6px;color:#047857;font-size:15px;font-weight:bold;">🔬 Professional Peptide Solutions</h4>
          <p style="margin:0 0 14px;color:#64748b;font-size:12.5px;">Need more help? Reply to this email or chat with us directly on WhatsApp.</p>
          <p style="margin:0 0 14px;color:#0f172a;font-size:13px;font-weight:600;">WhatsApp: ${links.whatsappDisplay}</p>
          <a href="https://api.whatsapp.com/send?phone=${links.whatsappNumber}" style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:13.5px;box-shadow:0 2px 4px rgba(37,211,102,0.15);">
            💬 Chat on WhatsApp
          </a>
        </div>

        <div style="background:#f1f5f9;padding:12px 24px;text-align:center;font-size:11px;color:#94a3b8;font-weight:500;">
          High-Purity Research Peptides · Based in Costa Rica
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `Peptides Costa Rica <omerforce@gmail.com>`,
      replyTo: 'omerforce@gmail.com',
      to: inquiry.customer_email,
      subject: `Re: ${inquiry.subject || 'Your Inquiry'} - Peptides Costa Rica`,
      html: replyHtml,
      text: `Hi ${inquiry.customer_name},\n\n${replyMessage.trim()}\n\n---\nYour original message:\n${inquiry.message}\n\n---\nPeptides Costa Rica\nWhatsApp: ${links.whatsappDisplay}`,
    });

    console.log(`[Inquiry Reply] Email sent to ${inquiry.customer_email}. MessageId: ${info.messageId}`);

    // Update the inquiry record in the database
    const { error: updateError } = await supabase
      .from('customer_inquiries')
      .update({
        admin_reply: replyMessage.trim(),
        replied_at: new Date().toISOString(),
        replied_by: adminEmail || 'admin',
        status: 'Replied'
      })
      .eq('id', inquiryId);

    if (updateError) {
      console.error('[Inquiry Reply] Failed to update inquiry record:', updateError);
      // Email was still sent successfully, so we return partial success
      return NextResponse.json({ 
        success: true, 
        warning: 'Email sent but failed to update database record',
        messageId: info.messageId 
      });
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId
    });
  } catch (err) {
    console.error('[Inquiry Reply] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
