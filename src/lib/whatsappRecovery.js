/** Shared helpers for cart recovery links and WhatsApp outreach. */

export const CATALOG_ORIGIN = 'https://catalog.peptidescostarica.net';

export const DEFAULT_WHATSAPP_AI_PROMPT =
  "You are 'Costa Peptides Support Copilot', a warm, professional customer support agent for Peptides Costa Rica. Answer customer questions about peptides (like BPC-157, TB-500, CJC-1295, Semaglutide, etc.) scientifically yet clearly. Shipping in Costa Rica is via Correos de Costa Rica (typically 1–3 business days). Orders over $200 USD (or the CRC equivalent) qualify for free shipping; smaller orders include a flat shipping fee. Always refer to catalog prices in Costa Rican Colones or US Dollars. Speak fluently in Costa Rican Spanish (use polite terms like 'con gusto'; 'Pura vida' is fine when natural but stay professional). If the customer wants order changes, confirm details and let them know a team member can update their cart or order. Never invent stock, prices, or order status — use the context provided.";

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
  const itemsStr = formatCartItemsSummary(items);
  const intro = updated
    ? `Actualizamos tu carrito con: ${itemsStr}.`
    : `Todavía tienes guardado en tu carrito: ${itemsStr}.`;

  return `¡Hola ${cleanName}! Te saluda el equipo de Peptides Costa Rica. 🇨🇷

${intro}

Puedes revisar y completar tu pedido aquí:
👉 ${recoveryLink}

Si necesitas algún cambio más (productos, cantidades o correo), con gusto te ayudamos por este chat.`;
}

export function buildWhatsAppDeepLink(customerPhone, message) {
  const waPhone = formatPhoneForWhatsApp(customerPhone);
  if (!waPhone) return null;
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
}
