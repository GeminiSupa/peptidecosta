function withRawSource(payload) {
  const source = payload?.source;
  if (!source) return payload;

  const raw = payload.raw_payload;
  const rawPayload = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...raw, source }
    : { value: raw ?? null, source };

  return {
    ...payload,
    raw_payload: rawPayload,
  };
}

function withoutTopLevelSource(payload) {
  const { source, ...rest } = withRawSource(payload);
  void source;
  return rest;
}

function isMissingSourceColumn(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return text.includes('source') && text.includes('whatsapp_messages');
}

function isMissingChannelColumn(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return text.includes('channel_id') && text.includes('whatsapp_messages');
}

function withoutChannelId(payload) {
  const { channel_id, ...rest } = payload;
  void channel_id;
  return rest;
}

export async function insertWhatsAppMessage(supabase, payload) {
  if (!supabase) return { data: null, error: null };

  // Meta can retry the same webhook. Do not duplicate a message that was
  // already committed during an earlier delivery attempt.
  if (payload?.meta_message_id) {
    const { data: existing, error: lookupError } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('meta_message_id', payload.meta_message_id)
      .limit(1)
      .maybeSingle();
    if (!lookupError && existing) return { data: existing, error: null, duplicate: true };
  }

  const first = await supabase
    .from('whatsapp_messages')
    .insert(withRawSource(payload));

  if (!first.error) return first;

  if (payload?.channel_id && isMissingChannelColumn(first.error)) {
    return insertWhatsAppMessage(supabase, withoutChannelId(payload));
  }

  if (!payload?.source || !isMissingSourceColumn(first.error)) {
    return first;
  }

  return supabase
    .from('whatsapp_messages')
    .insert(withoutTopLevelSource(payload));
}

export function getWhatsAppMessageSource(message) {
  return message?.source || message?.raw_payload?.source || 'cloud_api';
}
