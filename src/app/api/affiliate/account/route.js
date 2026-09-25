import { NextResponse } from 'next/server';
import { requireAffiliateSession } from '@/lib/affiliateSession';
import { affiliateCanWrite } from '@/lib/affiliateAccess.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * My Details.
 *
 * Two fields, treated very differently on purpose:
 *
 *   whatsapp  saved immediately. No money hangs off it.
 *   email     NOT saved. It becomes a request a superadmin answers, because an
 *             affiliate's email is both their login and where payout notices
 *             go. Self-service there would mean anyone who got into the account
 *             could quietly point the money somewhere else. Until it is
 *             approved the old address keeps doing both jobs.
 *
 * Nothing with money on it is writable at all: commission rate, payout amounts
 * and payout status are absent from this route by design, at both access
 * levels, so there is no version of "read_write" that lets someone change what
 * they are paid.
 */
export async function PATCH(request) {
  const session = await requireAffiliateSession(request);
  if (session.error) return session.error;

  const { affiliate, profile, supabaseAdmin } = session;

  if (!affiliateCanWrite(profile)) {
    return NextResponse.json(
      { ok: false, error: 'Your account is view-only. Ask us to update your details.' },
      { status: 403 }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Nothing to save' }, { status: 400 });
  }

  const results = { saved: [], requested: [] };

  if (Object.prototype.hasOwnProperty.call(body, 'whatsapp')) {
    const whatsapp = String(body.whatsapp ?? '').trim();
    const { error } = await supabaseAdmin
      .from('affiliates')
      .update({ whatsapp: whatsapp || null })
      .eq('id', affiliate.id);
    if (error) {
      console.error('[affiliate/account] whatsapp:', error.message);
      return NextResponse.json({ ok: false, error: 'Could not save your WhatsApp number' }, { status: 500 });
    }
    results.saved.push('whatsapp');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const current = String(affiliate.email || '').trim().toLowerCase();

    if (!EMAIL.test(email)) {
      return NextResponse.json(
        { ok: false, error: 'That email address does not look right. Check it and try again.' },
        { status: 400 }
      );
    }

    if (email !== current) {
      const { error } = await supabaseAdmin
        .from('affiliate_change_requests')
        .insert({
          affiliate_id: affiliate.id,
          field: 'email',
          current_value: affiliate.email || null,
          requested_value: email,
          requested_by_user_id: profile.user_id,
          requested_by_email: affiliate.email || null,
        });

      if (error) {
        // The unique index allows one open request per field. Asking twice is
        // an ordinary thing to do, not an error worth showing a stack trace for.
        if (error.code === '23505') {
          return NextResponse.json({
            ok: true,
            ...results,
            requested: [...results.requested, 'email'],
            message: 'You already have an email change waiting for approval.',
          });
        }
        if (/relation .* does not exist/i.test(error.message || '')) {
          return NextResponse.json(
            { ok: false, error: 'Email changes are not switched on yet. Run add-affiliate-dashboard.sql.' },
            { status: 503 }
          );
        }
        console.error('[affiliate/account] email request:', error.message);
        return NextResponse.json({ ok: false, error: 'Could not send your request' }, { status: 500 });
      }
      results.requested.push('email');
    }
  }

  return NextResponse.json({
    ok: true,
    ...results,
    message: results.requested.includes('email')
      ? 'Saved. Your email change has been sent for approval — your current address stays in use until then.'
      : 'Saved.',
  });
}
