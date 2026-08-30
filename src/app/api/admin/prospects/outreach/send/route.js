import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCampaignSmtpConfig } from '@/lib/campaignSmtp';
import { isProspectsTableMissing } from '@/lib/prospects.mjs';
import { isWhatsAppSuppressed } from '@/lib/whatsappCompliance';
import {
  canContactProspect,
  normalizeOutreachChannel,
  outreachDisclosure,
  prospectUpdatesForSend,
  whatsappHandoffUrl,
  WHATSAPP_HANDOFF_REASON,
} from '@/lib/prospectOutreach.mjs';
import { PROSPECT_OUTREACH_FIELDS, resolveBookingUrl } from '@/lib/prospectOutreachServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function linkify(text) {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:#2563eb">${url}</a>`,
  );
}

function emailHtml(body, disclosure) {
  const paragraphs = body.split(/\n{2,}/).map((block) => (
    `<p style="margin:0 0 14px">${linkify(block).replaceAll('\n', '<br />')}</p>`
  )).join('');

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
${paragraphs}
<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${escapeHtml(disclosure)}</p>
</div>`;
}

async function isEmailSuppressed(supabase, email) {
  try {
    const { data, error } = await supabase
      .from('marketing_suppressions')
      .select('id')
      .eq('active', true)
      .eq('identity', email)
      .in('channel', ['email', 'all'])
      .limit(1);
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    // Same fail-safe as the WhatsApp path: an unverifiable suppression list is
    // treated as a suppression, never as a green light.
    console.error('[Prospect outreach] Suppression lookup failed:', err.message);
    return true;
  }
}

async function logOutreach(supabase, row) {
  const { error } = await supabase.from('prospect_outreach').insert(row);
  if (error) console.error('[Prospect outreach] Log insert failed:', error.message);
  return error || null;
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    let requestBody;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { prospectId, channel, subject = '', body = '' } = requestBody;
    const outreachChannel = normalizeOutreachChannel(channel);
    const messageBody = String(body || '').trim();

    if (!prospectId) return NextResponse.json({ error: 'Prospect ID is required' }, { status: 400 });
    if (!outreachChannel) return NextResponse.json({ error: 'Choose email or WhatsApp' }, { status: 400 });
    if (messageBody.length < 20) return NextResponse.json({ error: 'The message is too short to send' }, { status: 400 });
    if (messageBody.length > 4000) return NextResponse.json({ error: 'The message is too long to send' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: prospect, error } = await supabase
      .from('sales_prospects')
      .select(PROSPECT_OUTREACH_FIELDS)
      .eq('id', prospectId)
      .single();

    if (isProspectsTableMissing(error)) {
      return NextResponse.json({ error: 'Run add-prospect-channel-permissions.sql and prospect-outreach-migration.sql first.', setupRequired: true }, { status: 503 });
    }
    if (error || !prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

    // Re-checked here rather than trusted from the draft step. The client can
    // send anything, and permission may have been revoked since the draft.
    const permission = canContactProspect(prospect, outreachChannel);
    if (!permission.allowed) return NextResponse.json({ error: permission.reason }, { status: 403 });

    const suppressed = outreachChannel === 'email'
      ? await isEmailSuppressed(supabase, permission.identity)
      : await isWhatsAppSuppressed(supabase, permission.identity);
    if (suppressed) {
      return NextResponse.json({ error: 'This contact has opted out of messages and cannot be contacted.' }, { status: 403 });
    }

    const bookingUrl = await resolveBookingUrl(supabase, prospect).catch(() => null);
    const disclosure = outreachDisclosure(permission, outreachChannel);
    const baseLog = {
      prospect_id: prospect.id,
      channel: outreachChannel,
      to_identity: permission.identity,
      subject: outreachChannel === 'email' ? String(subject || '').trim().slice(0, 200) : null,
      body: messageBody,
      booking_url: bookingUrl,
      permission_basis: permission.basis,
      sent_by: auth.user.id,
    };

    // A WhatsApp handoff is not delivery. Return the link without marking the
    // prospect contacted or writing a false "sent" history row; the rep can use
    // Mark contacted after they actually press Send in WhatsApp.
    if (outreachChannel === 'whatsapp') {
      const handoffUrl = whatsappHandoffUrl(permission.identity, messageBody, disclosure);
      if (!handoffUrl) return NextResponse.json({ error: 'Unable to build a WhatsApp link for this number.' }, { status: 400 });
      return NextResponse.json({
        success: true,
        channel: outreachChannel,
        recipient: permission.identity,
        bookingUrl,
        handoffUrl,
        handoffReason: WHATSAPP_HANDOFF_REASON,
        prospect: null,
      });
    }

    // Do not deliver mail if its audit trail is unavailable. Sending first and
    // discovering the migration is missing afterwards creates invisible mail.
    const { error: historyError } = await supabase.from('prospect_outreach').select('id').limit(1);
    if (historyError) {
      return NextResponse.json({ error: 'Outreach history is unavailable, so the email was not sent. Run prospect-outreach-migration.sql and try again.', setupRequired: isProspectsTableMissing(historyError) }, { status: 503 });
    }

    let providerId = null;

    if (outreachChannel === 'email') {
      const smtp = getCampaignSmtpConfig();
      if (!smtp.configured) {
        return NextResponse.json({ error: 'Campaign email sender credentials are not configured.' }, { status: 503 });
      }
      if (!baseLog.subject) return NextResponse.json({ error: 'A subject line is required' }, { status: 400 });

      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });

      try {
        const info = await transporter.sendMail({
          from: smtp.from,
          replyTo: smtp.replyTo,
          to: permission.identity,
          subject: baseLog.subject,
          text: `${messageBody}\n\n—\n${disclosure}`,
          html: emailHtml(messageBody, disclosure),
        });
        providerId = info?.messageId || null;
      } catch (sendError) {
        await logOutreach(supabase, { ...baseLog, status: 'failed', error: String(sendError.message || sendError).slice(0, 500) });
        return NextResponse.json({ error: `Email delivery failed: ${sendError.message}` }, { status: 502 });
      } finally {
        transporter.close();
      }
    }

    const logError = await logOutreach(supabase, { ...baseLog, status: 'sent', provider_id: providerId });

    const updates = { ...prospectUpdatesForSend(prospect.status), updated_at: new Date().toISOString() };
    const { data: updated, error: updateError } = await supabase
      .from('sales_prospects')
      .update(updates)
      .eq('id', prospect.id)
      .select('id, status, last_contacted_at, booking_token, meeting_booked_at')
      .single();

    if (updateError) console.error('[Prospect outreach] Status update failed:', updateError.message);

    return NextResponse.json({
      success: true,
      channel: outreachChannel,
      recipient: permission.identity,
      bookingUrl,
      handoffUrl: null,
      handoffReason: null,
      warning: [
        logError ? 'Its history entry could not be recorded.' : '',
        updateError ? 'The prospect status could not be updated.' : '',
      ].filter(Boolean).join(' ') || null,
      prospect: updated || null,
    });
  } catch (err) {
    console.error('[Prospect outreach] Send failed:', err);
    return NextResponse.json({ error: err.message || 'Unable to send outreach' }, { status: 500 });
  }
}
