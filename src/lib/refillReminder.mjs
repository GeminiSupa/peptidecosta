// Stock refill reminder.
//
// A month after a paid order, the customer gets one email listing what they
// bought and a link that puts those same products back in the cart. The link
// carries names and quantities only. Prices stay behind, so the catalog prices
// the cart the way it prices any other cart.
//
// This is a stock reminder. It does not mention a dose, a schedule, or a cycle.

import { isGiftLine, stripGiftSuffix } from './bacWater.mjs';
import { isPaidLike } from './orderStatusEmails.mjs';

const CATALOG_URL = 'https://catalog.peptidescostarica.net/catalog';
const MAX_LINES = 20;
const MAX_PARAM_LENGTH = 1800;

/** Days after a paid order before the stock-refill email. The account countdown uses the same number. */
export const REFILL_AFTER_DAYS = 30;

function oneLine(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function positiveQty(value) {
  const qty = Math.floor(Number(value));
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

export function escapeRefillHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asItems(items) {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Paid lines worth offering again. Gifts are left out; the cart grants those. */
export function refillLines(items = []) {
  const lines = [];
  const seen = new Map();

  for (const item of asItems(items)) {
    if (isGiftLine(item)) continue;
    const product = oneLine(stripGiftSuffix(item?.product));
    const qty = positiveQty(item?.qty);
    if (!product || !qty) continue;

    const key = product.toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      existing.qty += qty;
      continue;
    }
    const line = { product, qty };
    seen.set(key, line);
    lines.push(line);
    if (lines.length >= MAX_LINES) break;
  }

  return lines;
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Compact catalog param for a buy-again link. Null when there is nothing to buy. */
export function buyAgainParam(items = []) {
  const lines = refillLines(items).map((line) => ({ p: line.product, q: line.qty }));
  if (lines.length === 0) return null;
  const encoded = toBase64Url(JSON.stringify(lines));
  return encoded.length <= MAX_PARAM_LENGTH ? encoded : null;
}

export function buyAgainUrl(items = []) {
  const param = buyAgainParam(items);
  return param ? `${CATALOG_URL}?buy=${encodeURIComponent(param)}` : CATALOG_URL;
}

/**
 * Read a buy-again link back into the shape the catalog reorder already uses.
 * Anything that is not a short list of names and quantities is ignored.
 */
export function parseBuyAgainParam(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > MAX_PARAM_LENGTH) return null;

  let parsed;
  try {
    parsed = JSON.parse(fromBase64Url(raw));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const items = refillLines(parsed.map((line) => ({
    product: line?.p,
    qty: line?.q,
  })));
  return items.length > 0 ? { items } : null;
}

/** One email, and only for a paid order that still has something to reorder. */
export function shouldSendRefillReminder(order) {
  if (!oneLine(order?.customer_email)) return false;
  if (order?.reorder_reminded_at) return false;
  if (!isPaidLike(order?.status)) return false;
  return refillLines(order?.items).length > 0;
}

export function buildRefillEmail({ customerName, items } = {}) {
  const lines = refillLines(items);
  const first = lines[0]?.product || 'su pedido';
  const subject = lines.length > 1
    ? `Hora de reponer ${first} y más`
    : `Hora de reponer ${first}`;
  const url = buyAgainUrl(lines);
  const name = escapeRefillHtml(oneLine(customerName) || 'cliente');
  const rows = lines.map((line) => (
    `<li style="margin:0 0 6px;">${escapeRefillHtml(line.product)} — ${line.qty}</li>`
  )).join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="96" height="81" style="display:block;width:96px;height:81px;margin:0 auto 14px auto;border:0;outline:none;text-decoration:none;border-radius:10px;">
      <h2 style="font-size:20px;">Hora de reponer el inventario</h2>
      <p>Hola ${name},</p>
      <p>Hace cerca de un mes de su pedido. Esto es lo que compró, por si quiere reponer el stock:</p>
      <ul style="padding-left:18px;">${rows}</ul>
      <p>El enlace arma el mismo pedido en el carrito, con los precios y la disponibilidad de hoy.</p>
      <p>
        <a href="${escapeRefillHtml(url)}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Comprar de nuevo</a>
      </p>
      <p style="color:#64748b;font-size:13px;">Time to refill your stock. The button puts these same items in the cart at today's prices.</p>
      <p>Gracias,<br/>Peptides Costa Rica</p>
    </div>
  `;

  return { subject: oneLine(subject), html, url, lines };
}
