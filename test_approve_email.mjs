import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envData = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
envData.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].trim();
  }
});

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'omerforce@gmail.com'}>`;
const ADMIN_CC_EMAILS = 'info@peptidescostarica.net, omerforce@gmail.com';

async function testEmail() {
  const htmlPath = '/Users/apple/.gemini/antigravity/brain/4ccce890-0c09-4b66-9c19-8108f29aa008/scratch/dani_payout.html';
  const html = fs.readFileSync(htmlPath, 'utf8');

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

  try {
    const info = await transporter.sendMail({
      bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
      from: NOTIFICATION_FROM,
      to: 'elainedrb@gmail.com', // Dani's email
      cc: ADMIN_CC_EMAILS,
      subject: 'Weekly Commissions Invoice - Dani [10%]',
      html: html,
      text: 'Text fallback',
    });
    console.log('Success:', info.response);
  } catch (err) {
    console.error('Email failed to send:', err);
  }
}

testEmail();
