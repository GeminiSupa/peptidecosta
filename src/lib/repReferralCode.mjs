/**
 * The discount code that belongs in a sales rep's own referral link.
 *
 * A rep's link credits them but cannot discount anything by itself, because
 * nothing in the pricing path reads `sales_agent`. Putting their code on the
 * link is what gives their customer a price cut, so this is the lookup that
 * decides whether a rep's link discounts at all.
 *
 * Deliberately returns null rather than guessing when there is nothing
 * suitable: a link with no code still works exactly as it always did.
 */

/**
 * Codes that must never be pasted onto a shareable link.
 *
 * `auto_issued` codes are minted for one visitor (the WELCOME-xxxx and
 * AHORA10xxxx rows), so putting one on a printed QR would hand the same
 * one-person code to everybody who scans it.
 */
function isShareable(promo, now) {
  if (!promo || promo.is_active !== true) return false;
  if (promo.auto_issued === true) return false;
  if (promo.hidden === true) return false;

  const from = promo.valid_from ? new Date(promo.valid_from) : null;
  if (from && Number.isFinite(from.getTime()) && now < from) return false;

  const until = promo.valid_until ? new Date(promo.valid_until) : null;
  if (until && Number.isFinite(until.getTime()) && now > until) return false;

  const limit = Number(promo.usage_limit);
  if (Number.isFinite(limit) && limit > 0 && Number(promo.usage_count || 0) >= limit) {
    return false;
  }

  // A code with a minimum-units rule does not apply to the cart the customer
  // lands with, so the link would promise a discount the empty cart refuses.
  // It still works once they add enough, which is the code's own job to say.
  return true;
}

/**
 * Picks one code for a rep's link from the rows handed in.
 *
 * Kept separate from the query so it can be tested without a database. When a
 * rep owns several usable codes the newest wins — one rule, so the same rep
 * always gets the same link instead of whichever row the database returned
 * first.
 */
export function chooseRepReferralCode(promos = [], now = new Date()) {
  const usable = (promos || []).filter((promo) => isShareable(promo, now));
  if (!usable.length) return null;

  usable.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return usable[0].code || null;
}

/**
 * The rep's shareable code, or null.
 *
 * Never throws and never uses .single() / .maybeSingle(): a rep owning two
 * codes is ordinary, and PostgREST errors on more than one row. A failed
 * lookup must not cost the rep their link, so an error reads as "no code".
 *
 * @param {object} supabase an admin client
 * @param {string|null} affiliateId the rep's affiliates.id
 */
export async function findRepReferralCode(supabase, affiliateId) {
  if (!supabase || !affiliateId) return null;

  try {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('code, is_active, auto_issued, hidden, valid_from, valid_until, usage_limit, usage_count, created_at')
      .eq('affiliate_id', affiliateId);

    if (error) {
      console.warn('[repReferralCode]', error.message);
      return null;
    }
    return chooseRepReferralCode(data || []);
  } catch (err) {
    console.warn('[repReferralCode]', err?.message);
    return null;
  }
}
