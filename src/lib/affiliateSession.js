import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { affiliateIdForProfile } from '@/lib/affiliateAccess.mjs';

/**
 * The one door into every affiliate screen.
 *
 * Returns { profile, affiliate, supabaseAdmin } or { error }. The affiliate is
 * looked up from the signed-in user's id and nothing else — no id is accepted
 * from the query string or the body anywhere in this feature, which is what
 * makes "affiliate A reads affiliate B's orders" impossible rather than merely
 * guarded against.
 *
 * A staff login reaching these routes resolves to no affiliate and is refused,
 * so the routes stay closed by default in that direction too.
 */
export async function requireAffiliateSession(request) {
  const session = await verifyAdminSession(request, {
    allowAffiliate: true,
    skipPathPermission: true,
  });
  if (session.error) return { error: session.error };

  const supabaseAdmin = getSupabaseAdmin();
  const { data: affiliates, error } = await supabaseAdmin
    .from('affiliates')
    .select('*')
    .eq('admin_profile_user_id', session.profile.user_id);

  if (error) {
    console.error('[Affiliate] Could not load the affiliate for this login:', error.message);
    return {
      error: NextResponse.json({ error: 'Could not load your affiliate account' }, { status: 500 }),
    };
  }

  const affiliateId = affiliateIdForProfile(session.profile, affiliates || []);
  const affiliate = (affiliates || []).find((row) => row.id === affiliateId) || null;

  if (!affiliate) {
    return {
      error: NextResponse.json(
        { error: 'This login is not linked to an affiliate account' },
        { status: 403 }
      ),
    };
  }

  return { profile: session.profile, user: session.user, affiliate, supabaseAdmin };
}
