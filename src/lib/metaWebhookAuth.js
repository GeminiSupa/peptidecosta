import { NextResponse } from 'next/server';
import {
  META_SIGNATURE_HEADER,
  metaAppSecret,
  metaSignatureMatches,
} from './metaWebhookSignature.mjs';

/**
 * Guard for Meta's inbound webhooks (WhatsApp, Facebook, Messenger).
 *
 * Reads the body once, as text, and verifies Meta's signature over those exact
 * bytes. Returns the raw body for the caller to parse, or a response to return
 * immediately.
 *
 *   const verified = await verifyMetaWebhook(request, 'whatsapp');
 *   if (verified.response) return verified.response;
 *   const body = JSON.parse(verified.rawBody);
 *
 * A missing secret fails CLOSED. An unsigned endpoint is the very problem this
 * exists to fix, so it must never be reachable by forgetting a setting — the
 * 503 and the log line below are how that gets noticed instead.
 *
 * @param {Request} request
 * @param {string} channel - 'whatsapp' | 'facebook' | 'messenger'
 * @returns {Promise<{rawBody: string, response: null} | {rawBody: null, response: NextResponse}>}
 */
export async function verifyMetaWebhook(request, channel) {
  const secret = metaAppSecret(channel);
  if (!secret) {
    console.error(
      `[${channel} webhook] META_APP_SECRET is not set, so no delivery can be verified. `
      + 'Inbound messages are being refused until it is configured.',
    );
    return {
      rawBody: null,
      response: NextResponse.json({ error: 'Webhook signature is not configured' }, { status: 503 }),
    };
  }

  const rawBody = await request.text();
  const signature = request.headers.get(META_SIGNATURE_HEADER);
  if (!metaSignatureMatches(rawBody, signature, secret)) {
    // Deliberately terse. Meta retries a rejected delivery, and a body that
    // failed verification is not something to write into the logs.
    console.warn(`[${channel} webhook] Rejected a delivery with an invalid signature.`);
    return {
      rawBody: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { rawBody, response: null };
}
