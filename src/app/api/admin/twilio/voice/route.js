import { NextResponse } from 'next/server';

import { formatE164Phone, getTwilioConfig } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/twilio/voice
 * TwiML webhook called by Twilio when an outbound call is initiated from the browser.
 * Returns TwiML XML instructing Twilio to dial the target number.
 *
 * NOTE: This endpoint is called server-to-server by Twilio — no admin session check.
 * Security is provided by Twilio's request signature validation (optional enhancement).
 */
export async function POST(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse('<Response><Say>Invalid request.</Say></Response>', {
      status: 400,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // Twilio passes the dialed number as the 'To' param from the browser SDK call
  const rawTo = formData.get('To') || '';
  const config = getTwilioConfig();

  if (!rawTo || !config.isConfigured) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Sorry, the call could not be connected. Please try again.</Say>
</Response>`;
    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const formattedTo = formatE164Phone(rawTo);

  // Build TwiML: dial the number with a 30-second timeout, record the call
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${config.phoneNumber}" timeout="30" record="record-from-ringing">
    <Number>${formattedTo}</Number>
  </Dial>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
