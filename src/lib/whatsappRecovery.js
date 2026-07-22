/** Shared helpers for cart recovery links and WhatsApp outreach. */

export const CATALOG_ORIGIN = 'https://catalog.peptidescostarica.net';
export const WHATSAPP_COMPLIANCE_BLOCK_REASON =
  'WhatsApp cart recovery, sales outreach, and marketing broadcasts are disabled while the account is in support-only compliance mode.';

export const DEFAULT_WHATSAPP_AI_PROMPT =
  "You are 'Costa Peptides Support Copilot', a warm, professional support assistant for Peptides Costa Rica. Your role on WhatsApp is support-only. You may help with general service questions, shipping timelines already present in the provided context, order-status updates explicitly present in the context, and how to reach a human team member. Do not recommend, promote, compare, upsell, or explain specific peptide products. Do not provide prices, discounts, checkout help, payment assistance, cart recovery links, reorder prompts, or order-change guidance. If the customer asks to buy, reorder, complete checkout, change a cart, discuss restricted products, or requests information not explicitly present in context, politely say a human support specialist will help them through approved channels at +506 8404-6973, or the website. Speak fluently in Costa Rican Spanish when the customer uses Spanish, stay professional, and never invent stock, prices, policies, or order details.";

export function formatPhoneForWhatsApp(phone) {
  if (!phone) return '';
  let clean = String(phone).replace(/\D/g, '');
  if (clean.startsWith('00')) clean = clean.slice(2);
  if (clean.length === 8) clean = `506${clean}`;
  return clean;
}

export function buildCartRecoveryLink(sessionId, { origin = CATALOG_ORIGIN, salesAgent } = {}) {
  if (!sessionId) return `${origin}/catalog`;
  const params = new URLSearchParams({ recover_session: sessionId });
  if (salesAgent) params.set('sales_agent', salesAgent);
  return `${origin}/catalog?${params.toString()}`;
}

export function sanitizeCustomerName(name, fallback = 'Cliente') {
  if (!name || typeof name !== 'string') return fallback;
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || ['null', 'undefined', 'n/a', 'unknown'].includes(lower)) return fallback;
  return trimmed;
}

export function formatCartItemsSummary(items) {
  if (!Array.isArray(items) || items.length === 0) return 'tus productos';
  return items.map((i) => `${i.product || i.name || 'Péptido'} (x${i.qty || i.quantity || 1})`).join(', ');
}

/** Pre-filled WhatsApp message for sending an updated recovery cart link. */
export function buildCartRecoveryWhatsAppMessage({ name, items, recoveryLink, updated = false }) {
  const cleanName = sanitizeCustomerName(name);
  void items;
  void recoveryLink;
  void updated;

  return `¡Hola ${cleanName}! Gracias por escribirnos a Peptides Costa Rica.

En este momento nuestro canal de WhatsApp está disponible solo para soporte general. Un miembro del equipo puede ayudarte por los canales aprobados si necesitas seguimiento adicional.

Soporte: +506 8404-6973`;
}

export function buildWhatsAppDeepLink(customerPhone, message) {
  const waPhone = formatPhoneForWhatsApp(customerPhone);
  if (!waPhone) return null;
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
}
