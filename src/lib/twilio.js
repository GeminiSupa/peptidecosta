import twilio from 'twilio';

/**
 * Reads Twilio configuration from environment variables.
 */
export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
  const oldFlowSid = process.env.TWILIO_OLD_FLOW_SID || '';
  const newFlowSid = process.env.TWILIO_NEW_FLOW_SID || '';

  const isConfigured = Boolean(accountSid && authToken && phoneNumber);

  return {
    accountSid,
    authToken,
    phoneNumber,
    oldFlowSid,
    newFlowSid,
    isConfigured,
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
 * Sends an outbound SMS message via Twilio.
 */
export async function sendTwilioSms({ to, body }) {
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
      from: config.phoneNumber,
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
 * Fetches recent SMS messages from Twilio.
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
