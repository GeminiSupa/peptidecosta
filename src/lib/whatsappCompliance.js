// WhatsApp opt-out / opt-in compliance helpers.
//
// Meta requires businesses to honor opt-out requests ("You must respect all
// requests to opt out of communications"). This module detects Spanish/English
// opt-out (STOP/BAJA) and opt-in (ALTA) intents from inbound messages, and
// reads/writes the shared `marketing_suppressions` table so marketing sends can
// skip anyone who has opted out.

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (á → a)
    .replace(/[^a-z0-9\s]/g, ' ')    // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

// Unambiguous opt-out words — safe to match in a short message.
const OPT_OUT_STRONG = ['stop', 'baja', 'unsubscribe', 'desuscribir', 'desuscribirme', 'desuscribirse'];
// Ambiguous words (could mean "cancel my order") — only match when sent alone.
const OPT_OUT_WEAK = ['cancelar', 'parar', 'detener', 'salir'];
// Multi-word opt-out phrases.
const OPT_OUT_PHRASES = ['no molestar', 'no molesten', 'dejar de recibir', 'ya no quiero', 'no mas mensajes', 'quitar de la lista', 'borrar mi numero', 'darme de baja', 'dar de baja', 'darse de baja', 'de baja'];
// Re-subscribe words.
const OPT_IN = ['alta', 'suscribir', 'suscribirme', 'suscribirse', 'start', 'activar'];

/**
 * Detect opt-out / opt-in intent from an inbound message.
 * Conservative: only fires on short messages to avoid false positives such as
 * "cancelar mi pedido" (cancel order) or "no tengo dudas".
 * @returns {'opt_out' | 'opt_in' | null}
 */
export function detectWhatsAppIntent(text) {
  const n = normalize(text);
  if (!n) return null;
  const words = n.split(' ');

  if (OPT_OUT_PHRASES.some((p) => n.includes(p))) return 'opt_out';
  if (words.length <= 3 && words.some((w) => OPT_OUT_STRONG.includes(w))) return 'opt_out';
  if (words.length === 1 && OPT_OUT_WEAK.includes(words[0])) return 'opt_out';
  if (words.length <= 2 && words.some((w) => OPT_IN.includes(w))) return 'opt_in';
  return null;
}

/**
 * True ONLY if this phone number has an explicit WhatsApp opt-in on record
 * (someone ticked the consent box). Matches on the trailing 8 digits so that
 * differences in country-code formatting between tables don't cause a miss.
 * FAILS CLOSED: any uncertainty (no client, no match, DB error) returns false.
 */
export async function hasWhatsAppOptIn(supabase, phone) {
  if (!supabase || !phone) return false;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 8) return false;
  const last8 = digits.slice(-8);
  try {
    const { data, error } = await supabase
      .from('catalog_leads')
      .select('id')
      .eq('whatsapp_consent', true)
      .ilike('contact_value', `%${last8}%`)
      .limit(1);
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error('[WhatsApp Compliance] Opt-in lookup failed:', err.message);
    return false; // fail closed — never message someone we cannot confirm opted in
  }
}

/**
 * The single gate every MARKETING WhatsApp send must pass. Returns true only if
 * the number both opted in AND has not opted out. Transactional messages
 * (order confirmations, shipping updates) do NOT use this — only promos do.
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function canSendWhatsAppMarketing(supabase, phone) {
  if (await isWhatsAppSuppressed(supabase, phone)) {
    return { ok: false, reason: 'opted_out' };
  }
  if (!(await hasWhatsAppOptIn(supabase, phone))) {
    return { ok: false, reason: 'no_opt_in' };
  }
  return { ok: true };
}

/** True if this phone number has opted out of WhatsApp marketing. */
export async function isWhatsAppSuppressed(supabase, phone) {
  if (!supabase || !phone) return false;
  const identity = String(phone).replace(/\D/g, '');
  if (!identity) return false;
  try {
    const { data, error } = await supabase
      .from('marketing_suppressions')
      .select('id')
      .eq('active', true)
      .eq('identity', identity)
      .in('channel', ['whatsapp', 'all'])
      .limit(1);
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    // Fail SAFE for marketing: if we cannot verify, treat as suppressed so we
    // never accidentally message someone who opted out.
    console.error('[WhatsApp Compliance] Suppression lookup failed:', err.message);
    return true;
  }
}

/** Add or remove a WhatsApp marketing suppression for a phone number. */
export async function setWhatsAppSuppression(supabase, phone, active, opts = {}) {
  if (!supabase || !phone) return false;
  const identity = String(phone).replace(/\D/g, '');
  if (!identity) return false;
  const { reason = 'user_optout', source = 'whatsapp_inbound' } = opts;
  try {
    const { error } = await supabase.from('marketing_suppressions').upsert(
      {
        identity,
        channel: 'whatsapp',
        active,
        reason,
        source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'identity,channel' }
    );
    if (error) {
      console.error('[WhatsApp Compliance] Failed to update suppression:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[WhatsApp Compliance] Suppression write crashed:', err.message);
    return false;
  }
}

// Spanish confirmation messages sent back to the customer.
export const OPT_OUT_CONFIRMATION =
  '🔕 Listo. No le enviaremos más mensajes promocionales. Seguirá recibiendo información importante sobre sus pedidos. Para volver a recibir promociones, escriba *ALTA*.';
export const OPT_IN_CONFIRMATION =
  '🔔 ¡Listo! Se ha suscrito nuevamente a nuestras promociones y novedades. Gracias por su interés en Peptides Costa Rica. Para cancelar en cualquier momento, escriba *BAJA*.';
