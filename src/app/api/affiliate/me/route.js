import { NextResponse } from 'next/server';
import { requireAffiliateSession } from '@/lib/affiliateSession';
import { affiliateAccessMode } from '@/lib/affiliateAccess.mjs';
import { buildReferralLink, catalogBaseUrl, slugify } from '@/lib/referralLink.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * My Link & QR, plus My Details.
 *
 * Their promo codes come from promo_codes rows pointing at their affiliate id,
 * so the link handed over is the one that both credits them AND discounts the
 * customer. A link that attributes but cannot discount is the weaker of two
 * ways to do the same job, and having both on one screen is how someone picks
 * the wrong one.
 */
export async function GET(request) {
  const session = await requireAffiliateSession(request);
  if (session.error) return session.error;

  const { affiliate, profile, supabaseAdmin } = session;

  const { data: codes, error } = await supabaseAdmin
    .from('promo_codes')
    .select('code, discount_pct, is_active, valid_until, hidden')
    .eq('affiliate_id', affiliate.id)
    .order('is_active', { ascending: false });

  if (error) {
    console.error('[affiliate/me]', error.message);
    return NextResponse.json({ ok: false, error: 'Could not load your codes' }, { status: 500 });
  }

  const active = (codes || []).find((row) => row.is_active) || null;
  const base = catalogBaseUrl(process.env);
  const link = buildReferralLink(affiliate.name || '', base, {
    promoCode: active?.code || null,
  });

  // The short form is what a partner pastes into a message. /r/<slug> redirects
  // to `link` above, so both carry identical attribution — see src/app/r.
  const slug = slugify(affiliate.name || '');
  const shortLink = slug ? `${new URL(base).origin}/r/${slug}` : null;

  // A pending email change is shown back to them so the screen can say "waiting
  // for approval" rather than appearing to have forgotten what they asked for.
  const { data: pending } = await supabaseAdmin
    .from('affiliate_change_requests')
    .select('field, requested_value, created_at')
    .eq('affiliate_id', affiliate.id)
    .eq('status', 'pending');

  return NextResponse.json({
    ok: true,
    access: affiliateAccessMode(profile),
    affiliate: {
      name: affiliate.name || null,
      email: affiliate.email || null,
      whatsapp: affiliate.whatsapp || null,
      // Shown as a percentage they can read, never as something they can set.
      commissionRate: Number(affiliate.commission_rate || 0),
    },
    link,
    shortLink,
    codes: codes || [],
    pendingChanges: pending || [],
  });
}
