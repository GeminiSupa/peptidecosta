import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getBusinessLinks } from '@/lib/settings';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createUnsubscribeToken } from '@/lib/marketingTokens';
import { MARKETING_FOOTER_MARKER, applyMarketingEmailFooter } from '@/lib/marketingEmailFooter';
import { clampOutlookButtonSizes, personalizeMergeTags } from '@/lib/emailHtmlSafety';

const DOMAIN = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.costapeptides.com';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'omerforce@gmail.com'}>`;

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { to, subject, message, html_content, test_mode = false, ignoreSuppression = false, default_first_name = '', default_last_name = '' } = await request.json();
    const links = await getBusinessLinks();

    if (!to || !subject || (!message && !html_content)) {
      return NextResponse.json({ error: 'Missing required fields: to, subject, and email content' }, { status: 400 });
    }

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP settings are not configured in system environment' }, { status: 500 });
    }

    const recipient = to.trim().toLowerCase();

    // Look up subscriber (for the unsubscribe token) and any active suppression.
    let subscriberId = null;
    let subscriberFirstName = '';
    let subscriberLastName = '';
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const [{ data: sub }, { data: suppressed }] = await Promise.all([
        supabaseAdmin.from('email_subscribers').select('id, first_name, last_name').eq('email', recipient).maybeSingle(),
        supabaseAdmin.from('marketing_suppressions').select('id')
          .eq('active', true).eq('identity', recipient).in('channel', ['email', 'all']).limit(1),
      ]);
      subscriberId = sub?.id || null;
      subscriberFirstName = sub?.first_name || '';
      subscriberLastName = sub?.last_name || '';

      // Respect unsubscribes. ignoreSuppression is for genuine 1-on-1 support
      // replies the customer asked for — never for outreach.
      if (!ignoreSuppression && Array.isArray(suppressed) && suppressed.length > 0) {
        return NextResponse.json({
          error: `${recipient} has unsubscribed from emails. Emailing them anyway risks spam complaints that hurt deliverability for ALL your mail. Only override for a support reply they explicitly requested.`,
          suppressed: true,
        }, { status: 422 });
      }
    } catch (err) {
      console.warn('[Admin Outbound Email] Suppression lookup failed (continuing):', err.message);
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    // Make the message body render beautifully with paragraphs
    const rawHtml = html_content || `
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
          <a href="https://api.whatsapp.com/send?phone=${links.whatsappNumber}" style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:13.5px;box-shadow:0 2px 4px rgba(37,211,102,0.15);">
            💬 Chat with Support on WhatsApp
          </a>
        </div>

        <div style="background:#f1f5f9; padding:12px 24px; text-align:center; font-size:11px; color:#94a3b8; font-weight:500;">
          High-Purity Research Peptides · Base in Costa Rica
        </div>
      </div>
    `;

    // Unsubscribe headers keep us aligned with Gmail/Yahoo sender rules and give
    // recipients a clean exit instead of the "Report spam" button.
    const unsubscribeUrl = subscriberId
      ? `${DOMAIN}/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(subscriberId))}`
      : null;
    const listUnsubscribe = [
      ...(unsubscribeUrl ? [`<${unsubscribeUrl}>`] : []),
      `<mailto:${SMTP_USER}?subject=unsubscribe>`,
    ].join(', ');
    // Run the same fixes real sends get, so a test email is representative:
    // fix Outlook's oversized-button bug and resolve name merge tags. Names come
    // from the recipient's own subscriber record — no fabricated sample. If the
    // address has no name on file the tag resolves to empty (e.g. "HOLA!"), and
    // the campaign's own default value (set in the designer) fills in when
    // provided.
    const processedHtml = personalizeMergeTags(
      clampOutlookButtonSizes(rawHtml),
      {
        firstName: subscriberFirstName,
        lastName: subscriberLastName,
        defaultFirstName: default_first_name,
        defaultLastName: default_last_name,
      }
    );

    const formattedHtml = (test_mode || String(processedHtml).includes(MARKETING_FOOTER_MARKER))
      ? applyMarketingEmailFooter(processedHtml, {
        domain: DOMAIN,
        unsubscribeUrl: unsubscribeUrl || `${DOMAIN}/unsubscribe`,
        preferencesUrl: unsubscribeUrl || `${DOMAIN}/unsubscribe`,
        viewEmailUrl: DOMAIN,
      })
      : processedHtml;

    const info = await transporter.sendMail({
      bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
      from: NOTIFICATION_FROM,
      replyTo: SMTP_USER,
      to: to.trim(),
      subject: test_mode ? `[TEST] ${subject}` : subject,
      html: formattedHtml,
      text: message || undefined,
      headers: {
        'List-Unsubscribe': listUnsubscribe,
        ...(unsubscribeUrl ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {}),
      },
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
