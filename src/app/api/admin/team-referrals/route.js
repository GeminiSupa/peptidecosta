import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { buildReferralLink, catalogBaseUrl, referralQrFilename } from '@/lib/referralLink.mjs';
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
          link: buildReferralLink(name, base),
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
