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
      { ok: false, error: 'Your account is view-only. Contact Peptides Costa Rica and they will update your details.' },
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
            message: 'You have already asked for that. Peptides Costa Rica has not approved it yet.',
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

  // Fields this route does not own — commission_rate, amounts, anything with
  // money on it — are simply not read above. Saying "Saved." to a request that
  // changed nothing would tell someone their new commission rate had taken,
  // so a call that saved nothing says so.
  if (results.saved.length === 0 && results.requested.length === 0) {
    return NextResponse.json({
      ok: true,
      ...results,
      message: 'Nothing changed. You can update your WhatsApp number here and ask for an email change — everything else is set by Peptides Costa Rica.',
    });
  }

  return NextResponse.json({
    ok: true,
    ...results,
    message: results.requested.includes('email')
      ? 'Sent. Peptides Costa Rica has to approve your new email before it takes effect — keep signing in with your current address until then.'
      : 'Saved.',
  });
}

/**
 * Withdraw an email change that has not been answered yet.
 *
 * A mistyped address should not mean messaging Peptides Costa Rica and waiting
 * for somebody to notice — the person who made the request can take it back
 * themselves. Only a 'pending' row is touched, so a decision that has already
 * been made cannot be undone from here.
 */
export async function DELETE(request) {
  const session = await requireAffiliateSession(request);
  if (session.error) return session.error;

  const { affiliate, profile, supabaseAdmin } = session;

  if (!affiliateCanWrite(profile)) {
    return NextResponse.json(
      { ok: false, error: 'Your account is view-only. Contact Peptides Costa Rica and they will update your details.' },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('affiliate_change_requests')
    .update({
      status: 'cancelled',
      decided_at: new Date().toISOString(),
      decision_note: 'Withdrawn by the affiliate',
    })
    .eq('affiliate_id', affiliate.id)
    .eq('field', 'email')
    .eq('status', 'pending')
    .select('id');

  if (error) {
    console.error('[affiliate/account] cancel:', error.message);
    return NextResponse.json({ ok: false, error: 'Could not withdraw your request' }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'There is nothing waiting to withdraw.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: 'Withdrawn. Your email is unchanged and nothing is waiting for approval.',
  });
}
