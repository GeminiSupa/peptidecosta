import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildReferralLink, catalogBaseUrl, slugify } from '@/lib/referralLink.mjs';
import { findRepReferralCode } from '@/lib/repReferralCode.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Short referral links: /r/maria-jimenez
 *
 * The real link carries sales_agent, referral, three utm values, gate=skip and
 * a promo code, because every one of those is read somewhere between the click
 * and the commission scan. That makes it 200-odd characters of query string —
 * fine for a QR code, embarrassing pasted into WhatsApp by someone who is
 * trying to look professional.
 *
 * So this is a redirect, not a second kind of link. It resolves the slug, then
 * sends the visitor to exactly the URL they would have been given before,
 * attribution and all. Nothing downstream knows the difference.
 *
 * A slug that matches nobody goes to the plain catalog rather than an error
 * page: a partner has handed this to a customer, and a dead end helps nobody.
 * The visit simply earns no commission.
 */
export async function GET(request, { params }) {
  const { slug } = await params;
  const base = catalogBaseUrl(process.env);

  const wanted = slugify(slug);
  if (!wanted) return NextResponse.redirect(base, 302);

  try {
    const supabase = getSupabaseAdmin();

    // Affiliates first: this route exists for them. A sales rep who is also an
    // affiliate resolves to the same name either way.
    const { data: affiliates } = await supabase
      .from('affiliates')
      .select('id, name');

    const affiliate = (affiliates || []).find((row) => slugify(row.name) === wanted) || null;

    let name = affiliate?.name || null;
    if (!name) {
      const { data: profiles } = await supabase
        .from('admin_profiles')
        .select('name, status')
        .neq('status', 'suspended');
      name = (profiles || []).find((row) => slugify(row.name) === wanted)?.name || null;
    }

    if (!name) return NextResponse.redirect(base, 302);

    const promoCode = await findRepReferralCode(supabase, affiliate?.id || null);
    return NextResponse.redirect(buildReferralLink(name, base, { promoCode }), 302);
  } catch (error) {
    console.error('[r/slug]', error.message);
    return NextResponse.redirect(base, 302);
  }
}
