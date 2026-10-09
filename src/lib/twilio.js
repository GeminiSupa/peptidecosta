import twilio from 'twilio';
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

/**
 * Reads Twilio configuration from environment variables.
 */
export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
  const oldFlowSid = process.env.TWILIO_OLD_FLOW_SID || '';
  const newFlowSid = process.env.TWILIO_NEW_FLOW_SID || '';
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID || '';
  // Voice Access Tokens are signed with an API Key pair, never the auth
  // token. Twilio rejects a JWT signed with the account SID + auth token.
  const apiKeySid = process.env.TWILIO_API_KEY || '';
  const apiKeySecret = process.env.TWILIO_API_SECRET || '';

  const isConfigured = Boolean(accountSid && authToken && phoneNumber);
  const voiceReady = Boolean(isConfigured && twimlAppSid && apiKeySid && apiKeySecret);

  return {
    accountSid,
    authToken,
    phoneNumber,
    oldFlowSid,
    newFlowSid,
    twimlAppSid,
    apiKeySid,
    apiKeySecret,
    isConfigured,
    voiceReady,
  };
}

/**
 * Returns an initialized Twilio SDK client instance, or null if unconfigured.
 */
export function getTwilioClient() {
  const { accountSid, authToken, isConfigured } = getTwilioConfig();
  if (!isConfigured) return null;
  try {
    return twilio(accountSid, authToken);
  } catch (err) {
    console.error('[twilio] Failed to initialize client:', err);
    return null;
  }
}

/**
 * Helper to clean and format phone numbers into E.164 format.
 * Defaults to Costa Rica (+506) if an 8-digit local number is provided.
 */
export function formatE164Phone(phone) {
  if (!phone) return '';
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  if (!cleaned) return '';

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // 8-digit Costa Rica number without country code
  if (/^\d{8}$/.test(cleaned)) {
    return `+506${cleaned}`;
  }

  // 10-digit US/North America number without country code
  if (/^\d{10}$/.test(cleaned)) {
    return `+1${cleaned}`;
  }

  return `+${cleaned}`;
}

/**
 * Generates a short-lived Twilio Access Token with a VoiceGrant.
 * Used by the browser Twilio Voice SDK to authenticate outbound calls.
 */
export function generateVoiceToken({ identity = 'admin-dashboard' } = {}) {
  const config = getTwilioConfig();

  if (!config.isConfigured) {
    return { success: false, error: 'Twilio is not configured on this server.' };
  }
  if (!config.twimlAppSid) {
    return {
      success: false,
      error: 'TWILIO_TWIML_APP_SID is not set. Create a TwiML App in the Twilio Console first.',
    };
  }

  if (!config.apiKeySid || !config.apiKeySecret) {
    return {
      success: false,
      error:
        'TWILIO_API_KEY / TWILIO_API_SECRET are not set. Create a Standard API key in the Twilio Console; the auth token cannot sign a Voice token.',
    };
  }

  try {
    const token = new AccessToken(
      config.accountSid,
      // Signing credentials: an API Key SID (SK…) and its secret. The account
      // SID + auth token pair is NOT accepted here — Twilio rejects the JWT.
      config.apiKeySid,
      config.apiKeySecret,
      { identity, ttl: 3600 } // 1-hour token
    );

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: config.twimlAppSid,
      incomingAllow: false, // dashboard only makes outbound calls
    });

    token.addGrant(voiceGrant);

    return {
      success: true,
      token: token.toJwt(),
      identity,
      ttl: 3600,
    };
  } catch (err) {
    console.error('[twilio] generateVoiceToken error:', err);
    return {
      success: false,
      error: err.message || 'Failed to generate Twilio Voice Access Token.',
    };
  }
}

/**
 * Sends an outbound SMS message via Twilio.
 */
export async function sendTwilioSms({ to, body, from }) {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    return { success: false, error: 'Twilio is not configured on this server.' };
  }

  const formattedTo = formatE164Phone(to);
  if (!formattedTo) {
    return { success: false, error: 'Invalid destination phone number.' };
  }

  const senderNumber = formatE164Phone(from) || config.phoneNumber;

  const client = getTwilioClient();
  if (!client) {
    return { success: false, error: 'Could not connect to Twilio client.' };
  }

  try {
    const message = await client.messages.create({
      from: senderNumber,
      to: formattedTo,
      body: String(body || '').trim(),
    });

    return {
      success: true,
      sid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      dateCreated: message.dateCreated,
    };
  } catch (err) {
    console.error('[twilio] sendSms error:', err);
    return {
      success: false,
      error: err.message || 'Failed to send SMS message via Twilio.',
    };
  }
}

/**
 * Fetches all incoming phone numbers purchased under the Twilio account.
 */
export async function getTwilioPhoneNumbers() {
  const config = getTwilioConfig();
  if (!config.isConfigured) return { success: false, error: 'Twilio not configured', numbers: [] };
  const client = getTwilioClient();
  if (!client) return { success: false, error: 'Client unavailable', numbers: [] };

  try {
    const list = await client.incomingPhoneNumbers.list({ limit: 50 });
    const numbers = list.map((item) => ({
      sid: item.sid,
      phoneNumber: item.phoneNumber,
      friendlyName: item.friendlyName,
    }));
    return { success: true, numbers };
  } catch (err) {
    console.error('[twilio] getPhoneNumbers error:', err);
    return { success: false, error: err.message, numbers: [] };
  }
}

/**
 * Sends an outbound WhatsApp message via Twilio's WhatsApp Business API.
 * Requires the Twilio number to be WhatsApp-enabled in the Twilio Console.
 */
export async function sendTwilioWhatsApp({ to, body }) {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    return { success: false, error: 'Twilio is not configured on this server.' };
  }

  const formattedTo = formatE164Phone(to);
  if (!formattedTo) {
    return { success: false, error: 'Invalid destination phone number.' };
  }

  const client = getTwilioClient();
  if (!client) {
    return { success: false, error: 'Could not connect to Twilio client.' };
  }

  try {
    const message = await client.messages.create({
      from: `whatsapp:${config.phoneNumber}`,
      to: `whatsapp:${formattedTo}`,
      body: String(body || '').trim(),
    });

    return {
      success: true,
      sid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      dateCreated: message.dateCreated,
    };
  } catch (err) {
    console.error('[twilio] sendWhatsApp error:', err);
    return {
      success: false,
      error: err.message || 'Failed to send WhatsApp message via Twilio.',
    };
  }
}

/**
 * Triggers a Twilio Studio Flow execution (New Flow or Legacy Flow).
 */
export async function triggerStudioFlow({ flowSid, to, parameters = {} }) {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    return { success: false, error: 'Twilio is not configured on this server.' };
  }

  const targetFlowSid = flowSid || config.newFlowSid || config.oldFlowSid;
  if (!targetFlowSid) {
    return { success: false, error: 'No Studio Flow SID configured.' };
  }

  const formattedTo = formatE164Phone(to);
  if (!formattedTo) {
    return { success: false, error: 'Invalid destination phone number.' };
  }

  const client = getTwilioClient();
  if (!client) {
    return { success: false, error: 'Could not connect to Twilio client.' };
  }

  try {
    const execution = await client.studio.v2
      .flows(targetFlowSid)
      .executions.create({
        from: config.phoneNumber,
        to: formattedTo,
        parameters: typeof parameters === 'object' ? parameters : {},
      });

    return {
      success: true,
      executionSid: execution.sid,
      flowSid: execution.flowSid,
      status: execution.status,
      dateCreated: execution.dateCreated,
    };
  } catch (err) {
    console.error('[twilio] triggerStudioFlow error:', err);
    return {
      success: false,
      error: err.message || 'Failed to trigger Twilio Studio Flow execution.',
    };
  }
}

/**
 * Fetches recent SMS and WhatsApp messages from Twilio.
 */
export async function getTwilioMessages({ limit = 25 } = {}) {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    return { success: false, error: 'Twilio is not configured on this server.', messages: [] };
  }

  const client = getTwilioClient();
  if (!client) {
    return { success: false, error: 'Could not connect to Twilio client.', messages: [] };
  }

  try {
    const messageList = await client.messages.list({ limit: Math.min(limit, 50) });

    const messages = messageList.map((m) => ({
      sid: m.sid,
      from: m.from,
      to: m.to,
      body: m.body,
      status: m.status,
      direction: m.direction,
      dateCreated: m.dateCreated,
      price: m.price,
      priceUnit: m.priceUnit,
    }));

    return {
      success: true,
      messages,
      count: messages.length,
    };
  } catch (err) {
    console.error('[twilio] getMessages error:', err);
    return {
      success: false,
      error: err.message || 'Failed to fetch Twilio message log.',
      messages: [],
    };
  }
}

/**
 * Fetches recent call logs from Twilio.
 */
export async function getTwilioCallLogs({ limit = 20 } = {}) {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    return { success: false, error: 'Twilio is not configured on this server.', calls: [] };
  }

  const client = getTwilioClient();
  if (!client) {
    return { success: false, error: 'Could not connect to Twilio client.', calls: [] };
  }

  try {
    const callList = await client.calls.list({ limit: Math.min(limit, 50) });

    const calls = callList.map((c) => ({
      sid: c.sid,
      from: c.from,
      to: c.to,
      status: c.status,
      direction: c.direction,
      duration: c.duration, // seconds string
      startTime: c.startTime,
      endTime: c.endTime,
      price: c.price,
      priceUnit: c.priceUnit,
    }));

    return { success: true, calls, count: calls.length };
  } catch (err) {
    console.error('[twilio] getCallLogs error:', err);
    return {
      success: false,
      error: err.message || 'Failed to fetch Twilio call logs.',
      calls: [],
    };
  }
}
