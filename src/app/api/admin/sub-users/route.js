import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  DEFAULT_OVERRIDE_RATE,
  DEFAULT_SUB_USER_RATE,
  assertCanInvite,
  canBecomeSubUser,
  isSubUser,
  subUserCapFor,
  subUserSpotsUsed,
  validateSubUserParent,
} from '@/lib/subUserTier.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sub-users: the tier beneath sales staff.
 *
 * Staff invite; the owner approves. A sub-user earns 8% of an order they bring
 * and their staff member earns a 2% override on the same order, so the total
 * commission cost stays at 10%.
 *
 * Every route here is closed to sub-users themselves — verifyAdminSession
 * rejects tier='sub_user' by default, and assertCanInvite refuses them again on
 * the invite path. That is the API half of the two-level cap: a sub-user cannot
 * have sub-users, and no hand-crafted request can change that.
 */

const PROFILE_FIELDS = 'id, user_id, email, name, tier, status, parent_agent_id, commission_rate, override_rate, sub_user_cap, whatsapp_number, avatar_url, invited_by, approved_at, approved_by, created_at, is_superadmin';

const cleanText = (value) => (value == null ? null : String(value).trim() || null);
const normEmail = (value) => String(value || '').trim().toLowerCase();

/** GET — the caller's own people; the whole roster for a superadmin. */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profiles, error } = await supabaseAdmin
      .from('admin_profiles')
      .select(PROFILE_FIELDS)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[sub-users] Failed to load profiles:', error);
      return NextResponse.json({ error: 'Could not load your team' }, { status: 500 });
    }

    const all = profiles || [];
    const isOwner = Boolean(auth.profile.is_superadmin);

    // A staff member sees only the people parented to her. No other staff
    // member's roster, and no store-wide figures.
    const subUsers = all
      .filter(isSubUser)
      .filter((row) => isOwner || row.parent_agent_id === auth.profile.user_id);

    const staffById = new Map(
      all.filter((row) => !isSubUser(row)).map((row) => [row.user_id, row])
    );

    return NextResponse.json({
      success: true,
      isOwner,
      subUsers: subUsers.map((row) => ({
        ...row,
        parent_name: staffById.get(row.parent_agent_id)?.name || null,
      })),
      // The cap is per staff member so it can be raised for someone who earns it.
      spotsUsed: subUserSpotsUsed(auth.profile, all),
      cap: subUserCapFor(auth.profile),
      defaultSubUserRate: DEFAULT_SUB_USER_RATE,
      overrideRate: Number(auth.profile.override_rate ?? DEFAULT_OVERRIDE_RATE),
      staff: isOwner
        ? all.filter((row) => !isSubUser(row)).map((row) => ({ user_id: row.user_id, name: row.name, email: row.email }))
        : [],
    });
  } catch (err) {
    console.error('[sub-users] GET crashed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST — invite someone.
 *
 * No auth user is created here. The row sits at status='pending', earning
 * nothing and unable to log in, until the owner approves it. A declined invite
 * therefore leaves no login behind and costs nothing.
 */
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const name = cleanText(body.name);
    const email = normEmail(body.email);
    const whatsapp = cleanText(body.whatsapp_number);

    if (!name || !email) {
      return NextResponse.json({ error: 'A name and an email are required.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: profiles, error: loadError } = await supabaseAdmin
      .from('admin_profiles')
      .select(PROFILE_FIELDS);

    if (loadError) {
      console.error('[sub-users] Failed to load profiles for invite:', loadError);
      return NextResponse.json({ error: 'Could not check your team' }, { status: 500 });
    }

    const all = profiles || [];

    // A superadmin inviting on someone's behalf names the parent; staff always
    // parent to themselves.
    const parentId = auth.profile.is_superadmin && body.parent_agent_id
      ? body.parent_agent_id
      : auth.profile.user_id;
    const parent = all.find((row) => row.user_id === parentId);

    const parentCheck = validateSubUserParent(parent);
    if (!parentCheck.ok) {
      return NextResponse.json({ error: parentCheck.reason }, { status: 403 });
    }

    // The two-level cap plus the per-person spot limit.
    const inviteCheck = assertCanInvite(parent, all);
    if (!inviteCheck.ok) {
      return NextResponse.json({ error: inviteCheck.reason }, { status: 403 });
    }

    if (all.some((row) => normEmail(row.email) === email)) {
      return NextResponse.json({ error: 'Someone with that email is already on the team.' }, { status: 409 });
    }
    // orders.sales_agent is matched by name, so a duplicate name would split one
    // person's commission between two people. The database enforces this too.
    if (all.some((row) => String(row.name || '').trim().toLowerCase() === name.toLowerCase())) {
      return NextResponse.json(
        { error: `Someone on the team is already called "${name}". Please use a different name — commission is tracked by name.` },
        { status: 409 }
      );
    }

    const { data: created, error: insertError } = await supabaseAdmin
      .from('admin_profiles')
      .insert([{
        // user_id stays null until approval creates the auth user.
        email,
        name,
        tier: 'sub_user',
        status: 'pending',
        parent_agent_id: parentId,
        permissions: [],
        is_superadmin: false,
        commission_rate: DEFAULT_SUB_USER_RATE,
        // A sub-user is commission-only. No salary, ever.
        weekly_salary: 0,
        salary_currency: 'USD',
        whatsapp_number: whatsapp,
        invited_by: auth.profile.email,
      }])
      .select(PROFILE_FIELDS)
      .single();

    if (insertError) {
      console.error('[sub-users] Invite failed:', insertError);
      // The depth trigger and the unique-name index both surface here.
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, subUser: created });
  } catch (err) {
    console.error('[sub-users] POST crashed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH — approve, decline, suspend or reactivate. Owner only.
 *
 * Approving is the point at which the login is created, which is why it also
 * needs a password to hand over.
 */
export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { id, action } = body;
    const VALID = ['approve', 'decline', 'suspend', 'reactivate', 'set_rates'];

    if (!id || !VALID.includes(action)) {
      return NextResponse.json({ error: `id and one of ${VALID.join(', ')} are required.` }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: subUser, error: fetchError } = await supabaseAdmin
      .from('admin_profiles')
      .select(PROFILE_FIELDS)
      .eq('id', id)
      .single();

    if (fetchError || !subUser) {
      return NextResponse.json({ error: 'That person was not found.' }, { status: 404 });
    }
    if (!isSubUser(subUser)) {
      return NextResponse.json({ error: 'That person is a staff member, not a sub-user.' }, { status: 400 });
    }

    if (action === 'decline') {
      // Nothing to clean up: a pending invite never had an auth user.
      if (subUser.user_id) {
        await supabaseAdmin.auth.admin.deleteUser(subUser.user_id).catch((err) => {
          console.error('[sub-users] Could not remove auth user on decline:', err);
        });
      }
      const { error } = await supabaseAdmin.from('admin_profiles').delete().eq('id', id);
      if (error) {
        console.error('[sub-users] Decline failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, removed: true });
    }

    if (action === 'suspend' || action === 'reactivate') {
      const status = action === 'suspend' ? 'suspended' : 'active';
      const { data, error } = await supabaseAdmin
        .from('admin_profiles')
        .update({ status })
        .eq('id', id)
        .select(PROFILE_FIELDS)
        .single();
      if (error) {
        console.error('[sub-users] Status change failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, subUser: data });
    }

    if (action === 'set_rates') {
      const rate = Number(body.commission_rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return NextResponse.json({ error: 'Commission rate must be between 0 and 100.' }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin
        .from('admin_profiles')
        .update({ commission_rate: rate })
        .eq('id', id)
        .select(PROFILE_FIELDS)
        .single();
      if (error) {
        console.error('[sub-users] Rate change failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, subUser: data });
    }

    // --- approve ---
    const password = String(body.password || '');
    if (subUser.user_id) {
      // Already has a login; this is a re-approval after suspension.
      const { data, error } = await supabaseAdmin
        .from('admin_profiles')
        .update({ status: 'active', approved_at: new Date().toISOString(), approved_by: auth.profile.email })
        .eq('id', id)
        .select(PROFILE_FIELDS)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, subUser: data });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Set a password of at least 8 characters for them to log in with.' },
        { status: 400 }
      );
    }

    const parentCheck = canBecomeSubUser(subUser, { existingChildren: [] });
    if (!parentCheck.ok) {
      return NextResponse.json({ error: parentCheck.reason }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: subUser.email,
      password,
      email_confirm: true,
      user_metadata: { name: subUser.name },
    });

    if (authError) {
      console.error('[sub-users] Could not create login:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('admin_profiles')
      .update({
        user_id: authData.user.id,
        status: 'active',
        approved_at: new Date().toISOString(),
        approved_by: auth.profile.email,
      })
      .eq('id', id)
      .select(PROFILE_FIELDS)
      .single();

    if (error) {
      // Don't leave an orphan login behind if the profile update fails.
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      console.error('[sub-users] Approval failed after creating login:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subUser: data });
  } catch (err) {
    console.error('[sub-users] PATCH crashed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
