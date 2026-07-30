/**
 * The sub-user tier: a second earning level beneath sales staff.
 *
 * A sub-user is an ordinary admin_profiles row with a parent_agent_id, which
 * is what lets logins, orders.sales_agent attribution, the referral QR and the
 * weekly payout scan keep working with no changes.
 *
 * DEPTH IS CAPPED AT TWO. Staff -> sub-user, and no further. That rule is
 * enforced three times over, because the cost of a leak is money rather than
 * a cosmetic bug:
 *   - database: the trg_sub_user_depth trigger in add-sub-user-tier.sql
 *   - API:      canInviteSubUsers, called by the invite route
 *   - UI:       SUB_USER_TAB_IDS, which contains no 'my_team' tab
 *
 * Every reader here treats a MISSING tier/status column as staff/active, so
 * this module is safe to deploy before add-sub-user-tier.sql has been pasted
 * into Supabase. Until the migration runs, nobody is a sub-user and nothing
 * below changes any existing behaviour.
 */

export const TIER_STAFF = 'staff';
export const TIER_SUB_USER = 'sub_user';

export const STATUS_PENDING = 'pending';
export const STATUS_ACTIVE = 'active';
export const STATUS_SUSPENDED = 'suspended';

/** The deal, as defaults. Both are per-person columns, not constants. */
export const DEFAULT_SUB_USER_RATE = 8;
export const DEFAULT_OVERRIDE_RATE = 2;
export const DEFAULT_SUB_USER_CAP = 5;

/** How deep the tree may go. Staff is level 1, sub-user level 2. */
export const MAX_TIER_DEPTH = 2;

const norm = (value) => String(value ?? '').trim().toLowerCase();

/** A row with no tier column yet is staff — see the note at the top. */
export function profileTier(profile) {
  return norm(profile?.tier) === TIER_SUB_USER ? TIER_SUB_USER : TIER_STAFF;
}

export function isSubUser(profile) {
  return profileTier(profile) === TIER_SUB_USER;
}

export function isStaff(profile) {
  return profileTier(profile) === TIER_STAFF;
}

/**
 * Only 'pending' and 'suspended' block someone. A missing status column, or
 * any unrecognised value, counts as active so a half-applied migration can
 * never lock the existing team out of the dashboard.
 */
export function isActiveProfile(profile) {
  const status = norm(profile?.status);
  return status !== STATUS_PENDING && status !== STATUS_SUSPENDED;
}

export function isPendingApproval(profile) {
  return norm(profile?.status) === STATUS_PENDING;
}

/**
 * Can this person invite sub-users of their own?
 *
 * This is the API half of the depth cap. A sub-user always gets false, which
 * is what makes a third level impossible even for a hand-crafted request that
 * never touches the UI.
 */
export function canInviteSubUsers(profile) {
  if (!profile) return false;
  if (!isActiveProfile(profile)) return false;
  return isStaff(profile);
}

/**
 * Validate a proposed parent for a new sub-user. Mirrors the database trigger
 * so the API can refuse with a readable message instead of surfacing a raw
 * Postgres exception. The demotion direction — turning someone who already has
 * sub-users into a sub-user — is covered by canBecomeSubUser below.
 */
export function validateSubUserParent(parentProfile) {
  if (!parentProfile) {
    return { ok: false, reason: 'A sub-user must be attached to a staff member.' };
  }
  if (isSubUser(parentProfile)) {
    return {
      ok: false,
      reason: 'A sub-user cannot have sub-users of their own. Only two levels are allowed.',
    };
  }
  if (!isActiveProfile(parentProfile)) {
    return { ok: false, reason: 'That staff member is not active, so they cannot take on sub-users.' };
  }
  return { ok: true, reason: null };
}

/**
 * The other direction of the same rule: may this profile be turned INTO a
 * sub-user? No, if anyone is already parented to them — that edit would push
 * their children down to a third level.
 */
export function canBecomeSubUser(profile, { existingChildren = [] } = {}) {
  if (!profile) return { ok: false, reason: 'Unknown profile.' };
  if (profile.is_superadmin) {
    return { ok: false, reason: 'A superadmin cannot be a sub-user.' };
  }
  if (existingChildren.length > 0) {
    return {
      ok: false,
      reason: 'This person already has sub-users, so they cannot become a sub-user themselves.',
    };
  }
  return { ok: true, reason: null };
}

/** Profiles parented to this staff member. */
export function childrenOf(profile, allProfiles = []) {
  const parentId = profile?.user_id;
  if (!parentId) return [];
  return (allProfiles || []).filter(
    (candidate) => candidate?.parent_agent_id === parentId && isSubUser(candidate)
  );
}

/** Active sub-users count against the cap; pending and suspended do not. */
export function subUserSpotsUsed(profile, allProfiles = []) {
  return childrenOf(profile, allProfiles).filter(isActiveProfile).length;
}

export function subUserCapFor(profile) {
  const cap = Number(profile?.sub_user_cap);
  return Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_SUB_USER_CAP;
}

export function hasSubUserSpotFree(profile, allProfiles = []) {
  return subUserSpotsUsed(profile, allProfiles) < subUserCapFor(profile);
}

/**
 * The single gate the invite route calls. Returns a reason on refusal so the
 * caller can pass it straight to the person, rather than inventing copy.
 */
export function assertCanInvite(inviter, allProfiles = []) {
  if (!inviter) {
    return { ok: false, reason: 'Sign in again to invite someone.' };
  }
  if (isSubUser(inviter)) {
    return {
      ok: false,
      reason: 'Sub-users cannot invite their own sub-users. Only two levels are allowed.',
    };
  }
  if (!isActiveProfile(inviter)) {
    return { ok: false, reason: 'Your account is not active, so you cannot invite anyone.' };
  }
  if (!hasSubUserSpotFree(inviter, allProfiles)) {
    const cap = subUserCapFor(inviter);
    return {
      ok: false,
      reason: `You have used all ${cap} of your spots. Ask the owner to raise your limit.`,
    };
  }
  return { ok: true, reason: null };
}

/**
 * Move a sub-user to a different staff member. Superadmin only — a staff member
 * cannot hand her people to someone else, or take someone else's.
 *
 * The reason this exists is staff departures: when María leaves, Luis keeps his
 * 8% and his link, and the 2% override moves to whoever takes him on.
 *
 * The new parent must be staff, which is the two-level cap showing up again:
 * reassigning to a sub-user would create a third level just as surely as
 * inviting one.
 */
export function validateReassignment(subUser, newParent, allProfiles = []) {
  if (!subUser) return { ok: false, reason: 'Unknown sub-user.' };
  if (!isSubUser(subUser)) {
    return { ok: false, reason: 'That person is a staff member, not a sub-user.' };
  }
  if (!newParent) {
    return { ok: false, reason: 'Choose the staff member who will take them on.' };
  }
  if (newParent.user_id === subUser.user_id) {
    return { ok: false, reason: 'Nobody can be their own staff member.' };
  }
  if (newParent.user_id === subUser.parent_agent_id) {
    return { ok: false, reason: `${subUser.name || 'They'} is already on that staff member's team.` };
  }
  if (isSubUser(newParent)) {
    return {
      ok: false,
      reason: 'You can only move someone to a staff member. Sub-users cannot have sub-users.',
    };
  }
  if (!isActiveProfile(newParent)) {
    return { ok: false, reason: 'That staff member is not active, so they cannot take on sub-users.' };
  }
  // The person being moved will occupy a spot on the new team once they land.
  if (!hasSubUserSpotFree(newParent, allProfiles)) {
    return {
      ok: false,
      reason: `${newParent.name || 'That staff member'} has used all ${subUserCapFor(newParent)} of their spots. Raise their limit first.`,
    };
  }
  return { ok: true, reason: null };
}

/** Tabs a sub-user may reach. Deliberately short, and deliberately no 'my_team'. */
export const SUB_USER_TAB_IDS = new Set(['my_earnings', 'my_qr']);

export function subUserCanSeeTab(tabId) {
  return SUB_USER_TAB_IDS.has(tabId);
}
