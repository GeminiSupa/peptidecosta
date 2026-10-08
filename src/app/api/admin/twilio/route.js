import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import {
  getTwilioConfig,
  getTwilioMessages,
  sendTwilioSms,
  triggerStudioFlow,
} from '@/lib/twilio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/twilio
 * Returns Twilio status, configuration metadata, and recent SMS messages log.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const config = getTwilioConfig();

  if (!config.isConfigured) {
    return NextResponse.json({
      configured: false,
      phoneNumber: null,
      oldFlowSid: null,
      newFlowSid: null,
      messages: [],
      error: 'Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to environment.',
    });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 50);

  const messagesResult = await getTwilioMessages({ limit });

  return NextResponse.json({
    configured: true,
    phoneNumber: config.phoneNumber,
    accountSidSnippet: config.accountSid ? `${config.accountSid.slice(0, 6)}...${config.accountSid.slice(-4)}` : null,
    oldFlowSid: config.oldFlowSid,
    newFlowSid: config.newFlowSid,
    messages: messagesResult.messages || [],
    error: messagesResult.error || null,
  });
}

/**
 * POST /api/admin/twilio
 * Dispatches outbound SMS messages or triggers Studio Flows.
 * Body: { action: 'send_sms' | 'trigger_flow', to, message, flowSid, parameters }
 */
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const action = String(body?.action || 'send_sms').trim();
  const to = String(body?.to || '').trim();

  if (!to) {
    return NextResponse.json({ error: 'Destination phone number (to) is required.' }, { status: 400 });
  }

  if (action === 'trigger_flow') {
    const flowSid = String(body?.flowSid || '').trim();
    const parameters = body?.parameters && typeof body.parameters === 'object' ? body.parameters : {};

    const result = await triggerStudioFlow({ flowSid, to, parameters });
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Studio Flow execution failed.' }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      message: 'Studio Flow execution triggered successfully.',
      executionSid: result.executionSid,
      flowSid: result.flowSid,
      status: result.status,
    });
  }

  // Default action: send_sms
  const messageBody = String(body?.message || body?.body || '').trim();
  if (!messageBody) {
    return NextResponse.json({ error: 'SMS text message body is required.' }, { status: 400 });
  }

  const result = await sendTwilioSms({ to, body: messageBody });
  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Failed to send SMS.' }, { status: 422 });
  }

  return NextResponse.json({
    success: true,
    message: 'SMS message sent successfully.',
    sid: result.sid,
    status: result.status,
    to: result.to,
    from: result.from,
  });
}
