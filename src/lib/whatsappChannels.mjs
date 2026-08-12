export function normalizePhoneNumberId(value) {
  return String(value || '').trim().replace(/[^0-9A-Za-z_-]/g, '');
}

export function validateManualWhatsAppChannel(input = {}) {
  const name = String(input.name || '').trim().slice(0, 80);
  const phoneNumberId = String(input.phoneNumberId || '').trim();
  const wabaId = String(input.wabaId || '').trim();
  const displayPhoneNumber = String(input.displayPhoneNumber || '').trim().slice(0, 40);

  if (!name) return { error: 'A channel name is required.' };
  if (!/^\d{5,30}$/.test(phoneNumberId)) {
    return { error: 'Enter the numeric Phone Number ID from Meta, not the visible WhatsApp number.' };
  }
  if (wabaId && !/^\d{5,30}$/.test(wabaId)) {
    return { error: 'The WhatsApp Business Account ID must contain only numbers.' };
  }
  const visibleDigits = displayPhoneNumber.replace(/\D/g, '');
  if (displayPhoneNumber && (visibleDigits.length < 8 || visibleDigits.length > 15)) {
    return { error: 'Enter a valid visible WhatsApp number including country code.' };
  }

  return {
    value: {
      name,
      phoneNumberId,
      wabaId: wabaId || null,
      displayPhoneNumber: displayPhoneNumber || null,
    },
  };
}

export function getInboundWhatsAppChannel(value, entry = {}) {
  const metadata = value?.metadata || {};
  const phoneNumberId = normalizePhoneNumberId(metadata.phone_number_id);
  if (!phoneNumberId) return null;

  return {
    phoneNumberId,
    displayPhoneNumber: String(metadata.display_phone_number || '').trim() || null,
    wabaId: String(entry?.id || '').trim() || null,
    source: 'cloud_api',
  };
}

export function isMissingWhatsAppChannelsSchema(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || (/whatsapp_channels|channel_id|last_inbound_channel_id|last_outbound_channel_id|contact_lead_id/i.test(message)
      && /does not exist|schema cache|could not find|column/i.test(message));
}

export async function upsertWhatsAppChannel(supabase, channel = {}) {
  const phoneNumberId = normalizePhoneNumberId(channel.phoneNumberId);
  if (!supabase || !phoneNumberId) {
    return { data: null, error: null, available: Boolean(supabase) };
  }

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from('whatsapp_channels')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
  if (existingError && isMissingWhatsAppChannelsSchema(existingError)) {
    return { data: null, error: null, available: false };
  }
  if (existingError) return { data: null, error: existingError, available: true };

  const payload = {
    phone_number_id: phoneNumberId,
    waba_id: channel.wabaId || existing?.waba_id || null,
    display_phone_number: channel.displayPhoneNumber || existing?.display_phone_number || null,
    name: existing?.name || channel.name || channel.displayPhoneNumber || `WhatsApp ${phoneNumberId.slice(-4)}`,
    source: channel.source || existing?.source || 'cloud_api',
    status: 'active',
    metadata: {
      ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
      ...(channel.metadata && typeof channel.metadata === 'object' ? channel.metadata : {}),
    },
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('whatsapp_channels')
    .upsert(payload, { onConflict: 'phone_number_id' })
    .select('*')
    .single();

  if (error && isMissingWhatsAppChannelsSchema(error)) {
    return { data: null, error: null, available: false };
  }
  return { data: data || null, error, available: true };
}

export async function resolveOutboundWhatsAppChannel(supabase, {
  channelId = null,
  phoneNumberId = null,
} = {}) {
  const explicitPhoneNumberId = normalizePhoneNumberId(phoneNumberId);
  if (explicitPhoneNumberId) {
    return {
      channelId: channelId || null,
      phoneNumberId: explicitPhoneNumberId,
      channel: null,
    };
  }

  if (supabase && channelId) {
    const { data, error } = await supabase
      .from('whatsapp_channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle();

    if (error && !isMissingWhatsAppChannelsSchema(error)) throw error;
    if (data && data.status !== 'active') {
      throw new Error('The selected WhatsApp number is disabled. Enable it before replying.');
    }
    if (!data && !error) {
      throw new Error('The selected WhatsApp number no longer exists.');
    }
    if (data?.phone_number_id && data.phone_number_id !== 'legacy-default') {
      return {
        channelId: data.id,
        phoneNumberId: data.phone_number_id,
        channel: data,
      };
    }
  }

  return {
    channelId: null,
    phoneNumberId: normalizePhoneNumberId(process.env.WHATSAPP_PHONE_NUMBER_ID),
    channel: null,
  };
}

export function whatsappChannelLabel(channel) {
  return String(
    channel?.name
    || channel?.display_phone_number
    || (channel?.phone_number_id ? `WhatsApp ${String(channel.phone_number_id).slice(-4)}` : '')
    || 'WhatsApp'
  ).trim();
}
