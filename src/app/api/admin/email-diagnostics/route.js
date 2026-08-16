import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getTransactionalSmtpConfig } from '@/lib/transactionalSmtp';
import { getCampaignSmtpConfig } from '@/lib/campaignSmtp';
import { buildEmailDiagnostics } from '@/lib/emailDiagnostics.mjs';

export const runtime = 'nodejs';
// Env is read per request, never at module scope: a warm serverless instance
// that captured the old value at import time is exactly the confusion this
// endpoint exists to remove.
export const dynamic = 'force-dynamic';

const SMTP_TIMEOUTS = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
};

/**
 * Reports the live mail configuration, with secrets masked.
 *
 * `?verify=1` additionally opens an SMTP session and authenticates. That proves
 * the credentials are accepted without sending anything to anybody — the check
 * that was missing while everyone traded screenshots of the dashboard.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const transactional = getTransactionalSmtpConfig();
  const campaign = getCampaignSmtpConfig();
  const report = buildEmailDiagnostics({ env: process.env, transactional, campaign });

  const wantsVerify = new URL(request.url).searchParams.get('verify') === '1';
  if (wantsVerify) {
    if (!transactional.configured) {
      report.smtpLogin = { attempted: false, reason: 'Transactional SMTP is not configured.' };
    } else {
      try {
        const transporter = nodemailer.createTransport({
          host: transactional.host,
          port: transactional.port,
          secure: transactional.secure,
          auth: { user: transactional.user, pass: transactional.pass },
          ...SMTP_TIMEOUTS,
        });
        await transporter.verify();
        report.smtpLogin = { attempted: true, ok: true };
      } catch (err) {
        report.smtpLogin = { attempted: true, ok: false, error: err.message };
        report.problems.push(`SMTP login failed: ${err.message}`);
        report.healthy = false;
      }
    }
  }

  return NextResponse.json(report);
}
