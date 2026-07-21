import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import nodemailer from 'nodemailer';
import { applyMarketingEmailFooter } from '@/lib/marketingEmailFooter';
import { getCampaignSmtpConfig } from '@/lib/campaignSmtp';
import { clampOutlookButtonSizes, stabilizeSimpleLinkRows } from '@/lib/emailHtmlSafety';
import { LIVE_SITE_URL } from '@/lib/publicUrl';

const DOMAIN = process.env.NEXT_PUBLIC_BASE_URL || LIVE_SITE_URL;

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { email, subject, html_content } = await request.json();

    if (!email || !subject || !html_content) {
      return NextResponse.json(
        { error: 'Email, subject, and html_content are required' },
        { status: 400 }
      );
    }

    const smtp = getCampaignSmtpConfig();
    if (!smtp.configured) {
      return NextResponse.json(
        { error: 'Campaign email sender credentials are not configured' },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      }
    });

    await transporter.sendMail({
      bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
      from: smtp.from,
      replyTo: smtp.replyTo,
      to: email,
      subject: `[TEST] ${subject}`,
      html: applyMarketingEmailFooter(stabilizeSimpleLinkRows(clampOutlookButtonSizes(html_content)), {
        domain: DOMAIN,
        unsubscribeUrl: `${DOMAIN}/unsubscribe`,
        preferencesUrl: `${DOMAIN}/unsubscribe`,
        viewEmailUrl: DOMAIN,
      }),
    });

    return NextResponse.json({ success: true, message: `Test email sent to ${email}` });
  } catch (err) {
    console.error('Error sending test email:', err);
    const authenticationFailed = err?.code === 'EAUTH' || err?.responseCode === 535;
    return NextResponse.json({
      error: authenticationFailed
        ? 'Email service authentication failed. Check the deployed SMTP credentials.'
        : 'The email service could not send this test. Please try again.',
    }, { status: 500 });
  }
}
