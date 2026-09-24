import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { buildReferralLink, catalogBaseUrl, referralQrFilename } from '@/lib/referralLink.mjs';
import { chooseRepReferralCode } from '@/lib/repReferralCode.mjs';
import { isActiveProfile, profileTier } from '@/lib/subUserTier.mjs';
import { missingColumnFrom } from '@/lib/optionalColumns.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every rep's referral link in one call, for printing business cards.
 *
 * /api/agent/referral gives a rep their own link and their own scan numbers.
 * This is the owner's counterpart: the whole team at once, so QR codes can be
 * generated and handed to a print shop without logging in as each person.
 *
 * Superadmin only — a link is not sensitive on its own, but the roster with
 * commission rates attached is.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    // select('*') deliberately: admin_profiles has optional columns from
    // hand-applied migrations, and naming one that is absent fails the route.
    const { data: profiles, error } = await supabaseAdmin
      .from('admin_profiles')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      const missing = missingColumnFrom(error);
      if (missing) {
        return NextResponse.json(
          { error: `Your database is missing the "${missing}" column on admin_profiles.` },
          { status: 503 }
        );
      }
      console.error('[team-referrals] Failed to load profiles:', error);
      return NextResponse.json({ error: `Could not load the team: ${error.message}` }, { status: 500 });
    }

    const base = catalogBaseUrl(process.env);

    // A rep's own discount code, so the card they print discounts as well as
    // credits. Loaded in two queries and joined here rather than one lookup per
    // rep, because this runs for the whole team at once. A failure costs the
    // codes, never the links.
    const codeByUserId = new Map();
    try {
      const [{ data: affiliates }, { data: promos }] = await Promise.all([
        supabaseAdmin.from('affiliates').select('id, admin_profile_user_id').not('admin_profile_user_id', 'is', null),
        supabaseAdmin.from('promo_codes')
          .select('code, affiliate_id, is_active, auto_issued, hidden, valid_from, valid_until, usage_limit, usage_count, created_at')
          .not('affiliate_id', 'is', null),
      ]);

      const promosByAffiliate = new Map();
      for (const promo of promos || []) {
        const list = promosByAffiliate.get(promo.affiliate_id) || [];
        list.push(promo);
        promosByAffiliate.set(promo.affiliate_id, list);
      }
      for (const affiliate of affiliates || []) {
        const code = chooseRepReferralCode(promosByAffiliate.get(affiliate.id) || []);
        if (code) codeByUserId.set(affiliate.admin_profile_user_id, code);
      }
    } catch (err) {
      console.warn('[team-referrals] could not load rep codes:', err?.message);
    }

    const reps = (profiles || [])
      // A name is what orders.sales_agent matches on, so someone without one
      // cannot be credited and must not be handed a card.
      .filter((profile) => String(profile.name || '').trim().length > 0)
      .map((profile) => {
        const name = String(profile.name).trim();
        return {
          user_id: profile.user_id,
          name,
          email: profile.email,
          tier: profileTier(profile),
          active: isActiveProfile(profile),
          commission_rate: Number(profile.commission_rate || 0),
          is_superadmin: Boolean(profile.is_superadmin),
          promo_code: codeByUserId.get(profile.user_id) || null,
          link: buildReferralLink(name, base, { promoCode: codeByUserId.get(profile.user_id) }),
          filename: referralQrFilename(name),
        };
      });

    return NextResponse.json({
      success: true,
      // Sub-users have their own link too, but they are recruited rather than
      // hired and are listed separately so a card run does not mix the two.
      staff: reps.filter((rep) => rep.tier !== 'sub_user'),
      subUsers: reps.filter((rep) => rep.tier === 'sub_user'),
      catalogBase: base,
    });
  } catch (err) {
    console.error('[team-referrals] GET crashed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
