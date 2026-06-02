import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'info@peptidescostarica.net'}>`;

export async function POST(request) {
  try {
    const { to, subject, message } = await request.json();

    if (!to || !subject || !message) {
      return NextResponse.json({ error: 'Missing required fields: to, subject, message' }, { status: 400 });
    }

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP settings are not configured in system environment' }, { status: 500 });
    }

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

    // Make the message body render beautifully with paragraphs
    const formattedHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.03);">
        <!-- Header Banner -->
        <div style="background:linear-gradient(135deg, #0f172a, #022c22);padding:28px 24px;text-align:center;">
          <img src="https://catalog.peptidescostarica.net/logo.png" alt="Peptides Costa Rica" style="max-height:48px;border-radius:8px;margin-bottom:12px;background:rgba(255,255,255,0.08);padding:4px;">
          <h2 style="color:#ffffff;font-size:20px;font-weight:800;margin:0;letter-spacing:-0.5px;">Peptides Costa Rica Support</h2>
        </div>

        <!-- Body Content -->
        <div style="padding:32px 24px; font-size:15px; color:#334155;">
          ${message.trim().split('\n').map(p => p.trim() ? `<p style="margin:0 0 16px;">${p}</p>` : '').join('')}
        </div>

        <!-- CTA / Footer Support Block -->
        <div style="padding:20px 24px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center;">
          <h4 style="margin:0 0 6px; color:#047857; font-size:15px; font-weight:bold;">🔬 Professional Peptide Solutions</h4>
          <p style="margin:0 0 14px; color:#64748b; font-size:12.5px;">Our scientific support desk is ready to answer any questions about reconstitution, supplies, or shipping details.</p>
          <a href="https://api.whatsapp.com/send?phone=50684046973" style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:13.5px;box-shadow:0 2px 4px rgba(37,211,102,0.15);">
            💬 Chat with Support on WhatsApp
          </a>
        </div>

        <div style="background:#f1f5f9; padding:12px 24px; text-align:center; font-size:11px; color:#94a3b8; font-weight:500;">
          High-Purity Research Peptides · Base in Costa Rica
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `Peptides Costa Rica <info@peptidescostarica.net>`,
      replyTo: 'info@peptidescostarica.net',
      to: to.trim(),
      subject: subject,
      html: formattedHtml,
      text: message,
    });

    console.log(`[Admin Outbound Email] Outreach dispatched successfully to ${to}. MessageId: ${info.messageId}`);

    return NextResponse.json({
      success: true,
      messageId: info.messageId
    });
  } catch (err) {
    console.error('[Admin Outbound Email] Unexpected handler crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
