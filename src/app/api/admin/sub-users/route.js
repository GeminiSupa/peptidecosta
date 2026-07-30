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
  validateReassignment,
  validateSubUserParent,
} from '@/lib/subUserTier.mjs';
import {
  buildPaidOrderIndex,
  computeOverrideAmounts,
  hasBeenPaid,
  overrideRateFor,
} from '@/lib/subUserCommission.mjs';
import {
  COMMISSION_ELIGIBLE_ORDER_STATUSES,
  getOrderSalesAmounts,
  orderBelongsToAgent,
} from '@/lib/agentOrders';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import { SUB_USER_PROFILE_COLUMNS, missingColumnFrom } from '@/lib/optionalColumns.mjs';

/**
 * The whole tier lives in columns from add-sub-user-tier.sql. If that has not
 * been run, say so plainly instead of returning a 500 that reads like a bug —
 * migrations here are applied by hand, so this is a normal state to be in
 * between a deploy and a visit to the SQL editor.
 */
const MIGRATION_HINT = 'Sub-users are not switched on yet. Run add-sub-user-tier.sql in the Supabase SQL Editor.';

function migrationNotRun(error) {
  const missing = missingColumnFrom(error);
  return missing ? SUB_USER_PROFILE_COLUMNS.includes(missing) : false;
}

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

/**
 * The audit columns arrive with add-sub-user-reassignment.sql. Moving someone
 * only really needs parent_agent_id, so if that migration has not been run the
 * write drops the audit fields and still does the useful thing — same tolerance
 * writeWithOptionalPreferences gives member creation. One column at a time, and
 * only ones from this list; anything else is a real bug and is surfaced.
 */
const REASSIGN_AUDIT_COLUMNS = [
  'parent_since',
  'previous_parent_agent_id',
  'reassigned_by',
  'reassigned_at',
];

async function updateTolerantOfMissingAudit(payload, run) {
  let current = { ...payload };
  const dropped = [];

  for (let attempt = 0; attempt <= REASSIGN_AUDIT_COLUMNS.length; attempt += 1) {
    const result = await run(current);
    if (!result.error) return { ...result, droppedColumns: dropped };

    const missing = missingColumnFrom(result.error);
    if (!missing || !REASSIGN_AUDIT_COLUMNS.includes(missing) || !(missing in current)) {
      return { ...result, droppedColumns: dropped };
    }

    delete current[missing];
    dropped.push(missing);
  }

  return { ...(await run(current)), droppedColumns: dropped };
}

/**
 * Override this sub-user has earned their current staff member that has not been
 * paid out yet.
 *
 * This matters on reassignment. The weekly scan always credits the override to
 * whoever is the parent at scan time, so moving someone mid-week hands the
 * outgoing staff member's unpaid override to the incoming one. That is usually
 * wrong — she worked that week. Rather than build parent history to model it, the
 * API reports the figure and the UI makes the owner acknowledge it, with the fix
 * being obvious: run the payout scan and approve her week first, then reassign.
 */
async function outstandingOverrideFor(supabaseAdmin, subUser, currentParent) {
  const empty = { ordersCount: 0, usd: 0, crc: 0, parentName: currentParent?.name || null };
  if (!currentParent?.email) return empty;

  const { rate: exchangeRate } = await getDatabaseBackedUsdToCrcRate();

  const [{ data: orders }, { data: approved }] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select('id, sales_agent, status, currency, total, total_usd, total_crc')
      .in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES),
    supabaseAdmin
      .from('commission_payouts')
      .select('agent_email, orders_data, override_orders_data')
      .eq('status', 'Approved')
      .eq('agent_email', currentParent.email),
  ]);

  const paidIndex = buildPaidOrderIndex(approved || []);
  const unpaid = (orders || []).filter(
    (order) => orderBelongsToAgent(order, subUser)
      && !hasBeenPaid(paidIndex, currentParent.email, order.id)
  );

  let salesUsd = 0;
  let salesCrc = 0;
  for (const order of unpaid) {
    const amounts = getOrderSalesAmounts(order, exchangeRate);
    salesUsd += amounts.usd;
    salesCrc += amounts.crc;
  }

  const { overrideUsd, overrideCrc } = computeOverrideAmounts({
    usdSales: salesUsd,
    crcSales: salesCrc,
    overrideRate: overrideRateFor(currentParent),
  });

  return {
    ordersCount: unpaid.length,
    usd: overrideUsd,
    crc: overrideCrc,
    parentName: currentParent.name || currentParent.email,
  };
}

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
      if (migrationNotRun(error)) {
        return NextResponse.json({ error: MIGRATION_HINT, migrationRequired: true }, { status: 503 });
      }
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
      if (migrationNotRun(loadError)) {
        return NextResponse.json({ error: MIGRATION_HINT, migrationRequired: true }, { status: 503 });
      }
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
    const VALID = ['approve', 'decline', 'suspend', 'reactivate', 'set_rates', 'reassign'];

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

    // Move someone to a different staff member — the answer to "María left".
    // The sub-user keeps their 8%, their link and their login; only who collects
    // the 2% changes, and only from the next weekly scan onward.
    if (action === 'reassign') {
      const { data: allProfiles, error: profilesError } = await supabaseAdmin
        .from('admin_profiles')
        .select(PROFILE_FIELDS);

      if (profilesError) {
        console.error('[sub-users] Could not load profiles for reassign:', profilesError);
        return NextResponse.json({ error: 'Could not load the team' }, { status: 500 });
      }

      const all = allProfiles || [];
      const newParent = all.find((row) => row.user_id === body.parent_agent_id);
      const currentParent = all.find((row) => row.user_id === subUser.parent_agent_id);

      const check = validateReassignment(subUser, newParent, all);
      if (!check.ok) {
        return NextResponse.json({ error: check.reason }, { status: 400 });
      }

      // Warn once about override the outgoing staff member has earned but not
      // been paid. Approving her week first is almost always what you want.
      const outstanding = await outstandingOverrideFor(supabaseAdmin, subUser, currentParent);
      if (!body.confirm && outstanding.ordersCount > 0) {
        return NextResponse.json({
          success: false,
          needsConfirmation: true,
          outstanding,
          newParentName: newParent.name || newParent.email,
        });
      }

      const movedAt = new Date().toISOString();
      const { data, error, droppedColumns } = await updateTolerantOfMissingAudit(
        {
          parent_agent_id: newParent.user_id,
          previous_parent_agent_id: subUser.parent_agent_id || null,
          parent_since: movedAt,
          reassigned_by: auth.profile.email,
          reassigned_at: movedAt,
        },
        (row) => supabaseAdmin
          .from('admin_profiles')
          .update(row)
          .eq('id', id)
          .select(PROFILE_FIELDS)
          .single()
      );

      if (droppedColumns?.length) {
        console.warn(
          '[sub-users] Reassignment audit columns missing, run add-sub-user-reassignment.sql:',
          droppedColumns.join(', ')
        );
      }

      if (error) {
        // The depth trigger surfaces here if the target turned out not to be staff.
        console.error('[sub-users] Reassign failed:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        subUser: data,
        movedFrom: currentParent?.name || null,
        movedTo: newParent.name || newParent.email,
        outstandingMoved: outstanding.ordersCount,
      });
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
