import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import nodemailer from 'nodemailer';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { email, subject, html_content, from_name, from_email } = await request.json();

    if (!email || !subject || !html_content) {
      return NextResponse.json(
        { error: 'Email, subject, and html_content are required' },
        { status: 400 }
      );
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return NextResponse.json(
        { error: 'Email sender credentials are not configured' },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const senderName = from_name || 'Costa Peptides';
    const senderEmail = from_email || process.env.EMAIL_USER;

    await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: email,
      subject: `[TEST] ${subject}`,
      html: html_content,
    });

    return NextResponse.json({ success: true, message: `Test email sent to ${email}` });
  } catch (err) {
    console.error('Error sending test email:', err);
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 });
  }
}
