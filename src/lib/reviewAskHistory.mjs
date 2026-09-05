/**
 * Reading and writing a customer's review-ask history.
 *
 * The completion route and the review-requests cron both need the same two
 * things — what has this customer already been asked, and record that we just
 * asked them — so both go through here and cannot drift apart.
 *
 * Every function fails towards NOT asking. A customer who is asked twice about
 * the same site because a lookup failed is a worse outcome than one who is
 * asked a few days late, or not at all.
 */

import { decideReviewAsk, normaliseCustomerKey } from './reviewAskPolicy.mjs';
import { LIVE_SITE_URL } from './publicUrl.js';

/**
 * Every previous ask for this customer.
 *
 * @returns {Promise<{rows: Array, ok: boolean}>} ok is false when the history
 *          could not be read at all, which callers must treat as "do not ask"
 *          rather than "never been asked".
 */
export async function loadReviewAskHistory(supabase, email) {
  const key = normaliseCustomerKey(email);
  if (!supabase || !key) return { rows: [], ok: false };

  try {
    const { data, error } = await supabase
      .from('review_asks')
      .select('platforms, clicked_platform, asked_at')
      .eq('customer_email', key)
      .order('asked_at', { ascending: false })
      .limit(50);

    if (error) {
      // The table arrives via add-review-asks.sql. Until it is run, nothing can
      // be known about who has been asked, so nobody is asked.
      console.warn('[reviewAsks] history unavailable:', error.message);
      return { rows: [], ok: false };
    }
    return { rows: data || [], ok: true };
  } catch (err) {
    console.warn('[reviewAsks] history lookup threw:', err.message);
    return { rows: [], ok: false };
  }
}

/**
 * Record that we just asked this customer.
 *
 * @returns {Promise<string|null>} the ask id, needed to build the click links,
 *          or null when it could not be recorded.
 */
export async function recordReviewAsk(supabase, { email, order, platforms }) {
  const key = normaliseCustomerKey(email);
  if (!supabase || !key || !platforms?.length) return null;

  try {
    const { data, error } = await supabase
      .from('review_asks')
      .insert({
        customer_email: key,
        order_id: order?.id ? String(order.id) : null,
        order_number: order?.order_number || null,
        platforms,
        asked_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[reviewAsks] could not record the ask:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn('[reviewAsks] recording the ask threw:', err.message);
    return null;
  }
}

/**
 * The decision for one order, history included.
 *
 * @param {object} supabase
 * @param {object} order
 * @param {object} opts - { firstChoice, trustpilotHasRoom, now, env }
 */
export async function decideForOrder(supabase, order, opts = {}) {
  const { rows, ok } = await loadReviewAskHistory(supabase, order?.customer_email);
  if (!ok) {
    // `retry` separates "we decided not to ask" from "we could not decide".
    // Callers must not record a no-ask as final in this case: the order has to
    // stay eligible so it is reconsidered once the table exists. Marking it
    // handled here would silently retire every order completed before the
    // migration was run.
    return { ask: false, retry: true, platform: null, offer: [], reason: 'history unavailable, deciding later' };
  }
  return { ...decideReviewAsk({ history: rows, ...opts }), retry: false };
}

/**
 * The link a review button points at.
 *
 * Goes through our own redirect so the click is recorded before the customer
 * lands on the review page. Only the ask id and the site travel in the URL —
 * the destination itself is looked up server-side, so this can never be turned
 * into an open redirect by editing the link.
 *
 * Falls back to the review page itself when there is no ask id to attribute the
 * click to: a button that works and is not counted beats a broken button.
 */
export function reviewClickUrl(askId, platform, destination, siteUrl = LIVE_SITE_URL) {
  if (!askId) return destination;
  const base = String(siteUrl || LIVE_SITE_URL).replace(/\/+$/, '');
  return `${base}/api/reviews/click?a=${encodeURIComponent(askId)}&p=${encodeURIComponent(platform)}`;
}
