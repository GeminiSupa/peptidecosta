import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  getTwilioConfig,
  getTwilioMessages,
  getTwilioPhoneNumbers,
  sendTwilioSms,
  sendTwilioWhatsApp,
  triggerStudioFlow,
} from '@/lib/twilio';
import {
  buildCallRecordingSetting,
  CALL_RECORDING_SETTING_ID,
  readCallRecordingSetting,
} from '@/lib/twilioCallRecording.mjs';

/**
 * The recording switch as the Twilio tab should show it. A failed read shows
 * the shipped default rather than breaking the whole tab.
 */
async function loadCallRecording() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return readCallRecordingSetting(null);
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('id', CALL_RECORDING_SETTING_ID)
      .maybeSingle();
    return readCallRecordingSetting(data?.value);
  } catch (err) {
    console.error('[admin/twilio] could not read the recording switch:', err);
    return readCallRecordingSetting(null);
  }
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/twilio
 * Returns Twilio status, configuration metadata, recent SMS/WA messages log,
 * phone numbers pool, and voice readiness flag.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const config = getTwilioConfig();

  if (!config.isConfigured) {
    return NextResponse.json({
      configured: false,
      voiceReady: false,
      phoneNumber: null,
      phoneNumbers: [],
      oldFlowSid: null,
      newFlowSid: null,
      twimlAppSid: null,
      messages: [],
      callRecording: readCallRecordingSetting(null),
      error: 'Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to environment.',
    });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 50);

  const [messagesResult, numbersResult, callRecording] = await Promise.all([
    getTwilioMessages({ limit }),
    getTwilioPhoneNumbers(),
    loadCallRecording(),
  ]);

  return NextResponse.json({
    configured: true,
    voiceReady: config.voiceReady,
    phoneNumber: config.phoneNumber,
    phoneNumbers: numbersResult.numbers || [],
    accountSidSnippet: config.accountSid ? `${config.accountSid.slice(0, 6)}...${config.accountSid.slice(-4)}` : null,
    oldFlowSid: config.oldFlowSid,
    newFlowSid: config.newFlowSid,
    twimlAppSid: config.twimlAppSid || null,
    messages: messagesResult.messages || [],
    callRecording,
    error: messagesResult.error || null,
  });
}

/**
 * POST /api/admin/twilio
 * Dispatches outbound SMS, WhatsApp messages, or triggers Studio Flows.
 * Body: { action: 'send_sms' | 'send_whatsapp' | 'trigger_flow', to, from, message, flowSid, parameters }
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
  const from = String(body?.from || '').trim();

  // --- TURN CALL RECORDING ON / OFF ---
  // No destination number involved, so this answers before the 'to' check.
  if (action === 'set_call_recording') {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database is not reachable.' }, { status: 503 });
    }

    const value = buildCallRecordingSetting({
      enabled: body?.enabled !== false,
      changedBy: auth.profile?.name || null,
    });

    const { error } = await supabase
      .from('site_settings')
      .upsert({ id: CALL_RECORDING_SETTING_ID, value }, { onConflict: 'id' });

    if (error) {
      console.error('[admin/twilio] could not save the recording switch:', error);
      return NextResponse.json({ error: 'Could not save the recording setting.' }, { status: 500 });
    }

    const callRecording = readCallRecordingSetting(value);
    return NextResponse.json({
      success: true,
      callRecording,
      message: callRecording.enabled
        ? 'Calls will be recorded from now on.'
        : 'Calls will no longer be recorded.',
    });
  }

  if (!to) {
    return NextResponse.json({ error: 'Destination phone number (to) is required.' }, { status: 400 });
  }

  // --- TRIGGER STUDIO FLOW ---
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

  // --- SEND WHATSAPP ---
  if (action === 'send_whatsapp') {
    const messageBody = String(body?.message || body?.body || '').trim();
    if (!messageBody) {
      return NextResponse.json({ error: 'WhatsApp message body is required.' }, { status: 400 });
    }

    const result = await sendTwilioWhatsApp({ to, body: messageBody });
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send WhatsApp message.' }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp message sent successfully.',
      sid: result.sid,
      status: result.status,
      to: result.to,
      from: result.from,
    });
  }

  // --- DEFAULT: SEND SMS ---
  const messageBody = String(body?.message || body?.body || '').trim();
  if (!messageBody) {
    return NextResponse.json({ error: 'SMS text message body is required.' }, { status: 400 });
  }

  const result = await sendTwilioSms({ to, body: messageBody, from });
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
