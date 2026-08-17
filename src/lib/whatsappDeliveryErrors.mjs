// Making failed WhatsApp deliveries visible.
//
// Meta's send endpoint returning 200 means "accepted for delivery", nothing
// more. The real outcome arrives later on the status webhook, and when it is a
// failure it carries an errors[] array naming the reason — 131047 (outside the
// 24-hour window), 131026 (undeliverable number), 132001 (template not found),
// and so on.
//
// That array was being dropped. The webhook wrote delivery_status: 'failed' and
// discarded everything that said WHY, while the sender had already logged
// "sent successfully". A customer order confirmation could fail every single
// time and leave no trace anyone would find.

/** Meta error codes worth explaining in plain language when they show up. */
const KNOWN_CODES = {
  131047: 'Outside the 24-hour customer service window — a pre-approved template is required.',
  131026: 'Message undeliverable — the number may not be on WhatsApp.',
  131051: 'Unsupported message type.',
  132000: 'Template parameter count does not match the approved template.',
  132001: 'Template does not exist in this language, or is not approved.',
  132005: 'Template text exceeds the allowed length.',
  132007: 'Template content violates WhatsApp policy.',
  133010: 'Phone number is not registered on the WhatsApp Business account.',
  190: 'Access token is invalid or has expired.',
};

/**
 * Flatten Meta's errors[] into something worth logging and storing.
 *
 * Returns null when the status is not a failure, so callers can use it as the
 * decision as well as the description.
 */
export function describeWhatsAppDeliveryError(status) {
  if (String(status?.status || '').toLowerCase() !== 'failed') return null;

  const errors = Array.isArray(status?.errors) ? status.errors : [];
  if (errors.length === 0) {
    return {
      code: null,
      title: 'Unknown',
      detail: 'Meta reported delivery failure without an error code',
      hint: null,
      summary: 'Meta reported delivery failure without an error code',
    };
  }

  const [first] = errors;
  // Meta nests the useful sentence under error_data.details on some codes and
  // puts it in message on others; neither is reliably present.
  const code = first?.code ?? null;
  const title = first?.title || 'Delivery failed';
  const detail = first?.error_data?.details || first?.message || first?.title || 'No detail supplied';
  const hint = code != null ? KNOWN_CODES[code] || null : null;

  const parts = [code != null ? `[${code}]` : null, title, detail !== title ? `— ${detail}` : null]
    .filter(Boolean)
    .join(' ');

  return {
    code,
    title,
    detail,
    hint,
    summary: hint ? `${parts} (${hint})` : parts,
    // More than one error on a single status is rare but legal; keep the rest
    // rather than silently discarding them the way the old code did.
    additional: errors.slice(1).map((e) => ({ code: e?.code ?? null, title: e?.title || null })),
  };
}

/** One-line log message naming the recipient, the message and the reason. */
export function formatDeliveryFailureLog(status, description) {
  const recipient = status?.recipient_id || 'unknown recipient';
  const messageId = status?.id || 'unknown message';
  return `Delivery FAILED to ${recipient} (message ${messageId}): ${description?.summary || 'no detail'}`;
}
