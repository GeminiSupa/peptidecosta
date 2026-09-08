import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
const smtpHost = env.match(/SMTP_HOST=(.*)/);
const smtpPort = env.match(/SMTP_PORT=(.*)/);
const smtpSecure = env.match(/SMTP_SECURE=(.*)/);
const smtpUser = env.match(/SMTP_USER=(.*)/);
const smtpPass = env.match(/SMTP_PASS=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function resendMissing() {
  const { data: payouts, error } = await supabase
    .from('commission_payouts')
    .select('*')
    .eq('status', 'Approved')
    .gte('approved_at', '2026-09-06T00:00:00Z')
    .order('created_at', { ascending: false });

  if (error || !payouts || payouts.length === 0) {
    console.log('No payouts found or error:', error);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost[1].trim(),
    port: Number(smtpPort[1].trim()),
    secure: smtpSecure[1].trim() === 'true',
    auth: { user: smtpUser[1].trim(), pass: smtpPass[1].trim() },
  });

  for (const payout of payouts) {
    const payee = payout.agent_name || payout.agent_email || 'sin nombre';
    const period = ` — ${payout.start_date.substring(0, 10)} to ${payout.end_date.substring(0, 10)}`;
    const header = `Copia contable — Pago aprobado (comisión) — ${payee}${period}`;

    try {
      const info = await transporter.sendMail({
        from: `Peptides Costa Rica Records <${smtpUser[1].trim()}>`,
        to: 'pbagcr@peptidescostarica.net',
        subject: `[Resent] ${header}`,
        html: `<p style="font:600 14px/1.5 system-ui,sans-serif;color:#334155;margin:0 0 16px">${header}</p>${payout.email_html || 'No HTML stored.'}`,
        text: `${header}\n\nResent payout copy.`,
      });
      console.log(`Resent for ${payee}: ${info.messageId}`);
    } catch (err) {
      console.error(`Failed for ${payee}:`, err.message);
    }
  }
}

resendMissing();
