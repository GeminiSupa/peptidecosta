/**
 * What access does this affiliate actually have, right now?
 *
 * The Affiliates tab needs to answer that honestly for fifteen people whose
 * real roles only the owner knows. Two columns look like they answer it and
 * neither does:
 *
 *   affiliate_kind          filled in by a bulk update months ago
 *   has an admin login      logins were handed out through Team because that
 *                           was the only door to a dashboard
 *
 * So nothing here guesses. It reports the verifiable facts — is there a login,
 * what tier is it, what can it reach — and leaves the judgement to the person
 * reading the screen. `mismatch` flags a row worth a second look; it never
 * changes anything.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

import { isAffiliateTier, isSubUser } from './subUserTier.mjs';
import { affiliateAccessMode } from './affiliateAccess.mjs';

/**
 * One of four plain states:
 *   no_login        nobody can sign in as them
 *   affiliate_only  a login that reaches the four affiliate screens
 *   team_member     a staff or sub-user login — full team access
 *   orphan_link     the affiliate points at a login that no longer exists
 */
export function describeAffiliateAccess(affiliate, profiles = []) {
  const userId = affiliate?.admin_profile_user_id || null;

  if (!userId) {
    return {
      state: 'no_login',
      label: 'No login',
      userId: null,
      profileEmail: null,
      isSuperadmin: false,
      mode: null,
      reaches: [],
      mismatch: null,
    };
  }

  const profile = (profiles || []).find((row) => row?.user_id === userId) || null;

  if (!profile) {
    return {
      state: 'orphan_link',
      label: 'Linked to a login that no longer exists',
      userId,
      profileEmail: null,
      isSuperadmin: false,
      mode: null,
      reaches: [],
      mismatch: 'This affiliate points at a login that has been deleted. They cannot sign in.',
    };
  }

  const base = {
    userId,
    profileEmail: profile.email || null,
    isSuperadmin: Boolean(profile.is_superadmin),
  };

  if (isAffiliateTier(profile)) {
    return {
      ...base,
      state: 'affiliate_only',
      label: 'Affiliate only',
      mode: affiliateAccessMode(profile),
      reaches: ['Their link and QR', 'Their own orders', 'Their own payouts', 'Their own details'],
      mismatch: null,
    };
  }

  // Staff or sub-user: a full team login. Reported, never altered.
  const reaches = profile.is_superadmin
    ? ['Everything — this is a superadmin']
    : (Array.isArray(profile.permissions) && profile.permissions.length > 0
      ? profile.permissions
      : ['No tabs assigned yet']);

  return {
    ...base,
    state: 'team_member',
    label: profile.is_superadmin
      ? 'Superadmin'
      : (isSubUser(profile) ? 'Team member (sub-user)' : 'Team member'),
    mode: null,
    reaches,
    mismatch: profile.is_superadmin
      ? null
      : 'This affiliate signs in with a team login. Restrict them if they should only see their own numbers.',
  };
}

/**
 * What a person would lose by being cut back to affiliate-only — shown before
 * the button is pressed, so the consequence is never a surprise afterwards.
 */
export function restrictionPreview(access) {
  if (!access || access.state !== 'team_member') return null;
  return {
    loses: access.reaches,
    keeps: ['Their link and QR', 'Their own orders', 'Their own payouts', 'Their own details'],
    blocked: access.isSuperadmin
      ? 'They are a superadmin. Remove that first if you really mean to restrict them.'
      : null,
  };
}
