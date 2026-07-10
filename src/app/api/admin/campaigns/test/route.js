import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import nodemailer from 'nodemailer';

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
    const { email, subject, html_content } = await request.json();

    if (!email || !subject || !html_content) {
      return NextResponse.json(
        { error: 'Email, subject, and html_content are required' },
        { status: 400 }
      );
    }

    if (!SMTP_USER || !SMTP_PASS || !SMTP_HOST) {
      return NextResponse.json(
        { error: 'Email sender credentials are not configured' },
        { status: 500 }
      );
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

    await transporter.sendMail({
      bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
      from: NOTIFICATION_FROM,
      replyTo: SMTP_USER,
      to: email,
      subject: `[TEST] ${subject}`,
      html: html_content,
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
