import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { AFFILIATE_ACCESS_MODES, AFFILIATE_ACCESS_READ } from '@/lib/affiliateAccess.mjs';
import { describeAffiliateAccess } from '@/lib/affiliateAdminAccess.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Giving an affiliate a login, and taking it away — from the Affiliates tab.
 *
 * Until now the only way to hand an affiliate a dashboard was to create them
 * in Team, which is how outside partners ended up holding staff access nobody
 * meant to give them. This route closes that detour: the affiliate is created
 * where affiliates live, and the login it makes can only ever be tier
 * 'affiliate'.
 *
 * Superadmin only, all of it. Handing out logins is not something a staff
 * permission should cover.
 *
 * IT NEVER CHANGES SOMEBODY WHO IS ALREADY ON THE TEAM. A staff login found on
 * an affiliate row is reported back, not touched — demoting a colleague as a
 * side effect of tidying an affiliate row is exactly the kind of surprise this
 * portal has had too many of. Cutting someone back to affiliate-only is a
 * separate, deliberate action ('restrict'), and it refuses a superadmin.
 */

const MIN_PASSWORD = 8;

/** GET — what access does each affiliate actually have right now? */
export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true, skipPathPermission: true });
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: affiliates, error }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from('affiliates').select('*').order('name'),
    supabaseAdmin.from('admin_profiles').select('user_id, name, email, tier, status, permissions, is_superadmin, affiliate_access'),
  ]);

  if (error) {
    console.error('[affiliates/access]', error.message);
    return NextResponse.json({ error: 'Could not load affiliates' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    affiliates: (affiliates || []).map((affiliate) => ({
      id: affiliate.id,
      name: affiliate.name,
      email: affiliate.email,
      commissionRate: Number(affiliate.commission_rate || 0),
      ...describeAffiliateAccess(affiliate, profiles || []),
    })),
  });
}

/** POST — create the login, or change the access mode, or restrict. */
export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true, skipPathPermission: true });
  if (auth.error) return auth.error;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Nothing to do' }, { status: 400 });
  }

  const { affiliateId, action } = body;
  if (!affiliateId) return NextResponse.json({ error: 'Which affiliate?' }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: affiliate, error: affiliateError } = await supabaseAdmin
    .from('affiliates')
    .select('*')
    .eq('id', affiliateId)
    .single();

  if (affiliateError || !affiliate) {
    return NextResponse.json({ error: 'That affiliate no longer exists.' }, { status: 404 });
  }

  const { data: profiles } = await supabaseAdmin
    .from('admin_profiles')
    .select('user_id, name, email, tier, status, permissions, is_superadmin, affiliate_access');

  const current = describeAffiliateAccess(affiliate, profiles || []);

  if (action === 'create_login') {
    return createLogin({ supabaseAdmin, affiliate, current, body, actor: auth.profile });
  }
  if (action === 'set_mode') {
    return setMode({ supabaseAdmin, affiliate, current, body });
  }
  if (action === 'restrict') {
    return restrict({ supabaseAdmin, affiliate, current, actor: auth.profile });
  }
  if (action === 'revoke_login') {
    return revokeLogin({ supabaseAdmin, affiliate, current });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

async function createLogin({ supabaseAdmin, affiliate, current, body, actor }) {
  if (current.state !== 'no_login') {
    return NextResponse.json(
      { error: `${affiliate.name || 'This affiliate'} already has a login.` },
      { status: 409 }
    );
  }

  const email = String(affiliate.email || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: 'Add an email address to this affiliate first — it is what they sign in with.' },
      { status: 400 }
    );
  }

  const password = String(body.password || '');
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Set a password of at least ${MIN_PASSWORD} characters for them to sign in with.` },
      { status: 400 }
    );
  }

  const mode = AFFILIATE_ACCESS_MODES.includes(body.mode) ? body.mode : AFFILIATE_ACCESS_READ;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: affiliate.name || email },
  });

  if (authError) {
    console.error('[affiliates/access] createUser:', authError.message);
    const duplicate = /already been registered|already exists/i.test(authError.message || '');
    return NextResponse.json(
      {
        error: duplicate
          ? 'Somebody already signs in with that email. Check whether they are on the team already.'
          : authError.message,
      },
      { status: duplicate ? 409 : 500 }
    );
  }

  const { error: profileError } = await supabaseAdmin.from('admin_profiles').insert({
    user_id: authData.user.id,
    name: affiliate.name || email,
    email,
    tier: 'affiliate',
    status: 'active',
    is_superadmin: false,
    permissions: [],
    affiliate_access: mode,
    approved_at: new Date().toISOString(),
    approved_by: actor.email,
  });

  if (profileError) {
    // No orphan login left behind if the profile could not be written.
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
    console.error('[affiliates/access] profile insert:', profileError.message);
    const missing = /column .* does not exist|schema cache/i.test(profileError.message || '');
    return NextResponse.json(
      {
        error: missing
          ? 'Affiliate logins are not switched on yet. Run add-affiliate-dashboard.sql in Supabase first.'
          : profileError.message,
      },
      { status: missing ? 503 : 500 }
    );
  }

  const { error: linkError } = await supabaseAdmin
    .from('affiliates')
    .update({ admin_profile_user_id: authData.user.id })
    .eq('id', affiliate.id);

  if (linkError) {
    await supabaseAdmin.from('admin_profiles').delete().eq('user_id', authData.user.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
    console.error('[affiliates/access] link:', linkError.message);
    return NextResponse.json({ error: 'Could not link the login to the affiliate.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: `${affiliate.name || email} can now sign in at /affiliate.`,
  });
}

async function setMode({ supabaseAdmin, affiliate, current, body }) {
  if (!current.userId) {
    return NextResponse.json({ error: 'That affiliate has no login yet.' }, { status: 400 });
  }
  if (!AFFILIATE_ACCESS_MODES.includes(body.mode)) {
    return NextResponse.json({ error: 'Choose view-only or view and edit.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('admin_profiles')
    .update({ affiliate_access: body.mode })
    .eq('user_id', current.userId);

  if (error) {
    console.error('[affiliates/access] setMode:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: 'Saved.' });
}

/**
 * Cut a team login back to affiliate-only.
 *
 * Deliberate, one person at a time, and never automatic: what a person really
 * is, is something only the owner knows. Nothing in this file infers it from
 * affiliate_kind or from who happens to hold a login.
 */
async function restrict({ supabaseAdmin, affiliate, current, actor }) {
  if (!current.userId) {
    return NextResponse.json({ error: 'That affiliate has no login to restrict.' }, { status: 400 });
  }
  if (current.isSuperadmin) {
    return NextResponse.json(
      { error: 'That person is a superadmin. Remove that first if you really mean to restrict them.' },
      { status: 400 }
    );
  }
  if (current.state === 'affiliate_only') {
    return NextResponse.json({ ok: true, message: 'They are already affiliate-only.' });
  }

  const { error } = await supabaseAdmin
    .from('admin_profiles')
    .update({
      tier: 'affiliate',
      parent_agent_id: null,
      permissions: [],
      affiliate_access: AFFILIATE_ACCESS_READ,
    })
    .eq('user_id', current.userId);

  if (error) {
    console.error('[affiliates/access] restrict:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.warn(
    `[affiliates/access] ${actor.email} restricted ${current.profileEmail} to affiliate-only`
  );
  return NextResponse.json({
    ok: true,
    message: `${affiliate.name || 'They'} can now only see their own link, orders and payouts.`,
  });
}

async function revokeLogin({ supabaseAdmin, affiliate, current }) {
  if (current.state !== 'affiliate_only') {
    return NextResponse.json(
      { error: 'Only an affiliate-only login can be removed here. Team members are managed in Team.' },
      { status: 400 }
    );
  }

  await supabaseAdmin.from('affiliates').update({ admin_profile_user_id: null }).eq('id', affiliate.id);
  await supabaseAdmin.from('admin_profiles').delete().eq('user_id', current.userId);
  await supabaseAdmin.auth.admin.deleteUser(current.userId).catch(() => {});

  return NextResponse.json({ ok: true, message: 'Their login has been removed.' });
}
