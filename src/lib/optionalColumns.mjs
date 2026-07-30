/**
 * Writing rows whose columns may not exist yet.
 *
 * Migrations here are pasted into the Supabase SQL Editor by hand, so code and
 * schema drift apart routinely — a deploy can land minutes or days before the
 * SQL does. That is survivable for a new feature, which simply does not work
 * yet. It is NOT survivable when the new columns share a table with something
 * that already works: commission_payouts gained override columns for the
 * sub-user tier, and a plain insert would fail the whole weekly payout scan for
 * existing staff whose commissions have nothing to do with sub-users.
 *
 * So writes that touch new columns go through here. One column is dropped at a
 * time, and only if the database names it and it appears in the caller's allow
 * list; anything else is a real bug and is surfaced untouched.
 *
 * Generalised from writeWithOptionalPreferences, which does the same job for
 * the notification preference columns on admin_profiles.
 */

import { missingColumnFrom } from './notificationPreferences.mjs';

export { missingColumnFrom };

/**
 * @param payload  the row to write
 * @param optional column names that may legitimately be absent
 * @param run      receives a (possibly reduced) row, returns a Supabase result
 * @returns the Supabase result plus { droppedColumns }
 */
export async function writeDroppingMissingColumns(payload, optional, run) {
  const allowed = new Set(optional || []);
  let current = { ...payload };
  const dropped = [];

  for (let attempt = 0; attempt <= allowed.size; attempt += 1) {
    const result = await run(current);
    if (!result?.error) return { ...result, droppedColumns: dropped };

    const missing = missingColumnFrom(result.error);
    if (!missing || !allowed.has(missing) || !(missing in current)) {
      return { ...result, droppedColumns: dropped };
    }

    delete current[missing];
    dropped.push(missing);
  }

  return { ...(await run(current)), droppedColumns: dropped };
}

/** Columns added by add-sub-user-tier.sql and add-sub-user-override-to-payouts.sql. */
export const SUB_USER_PAYOUT_COLUMNS = [
  'agent_tier',
  'override_rate',
  'override_usd',
  'override_crc',
  'override_sales_usd',
  'override_sales_crc',
  'override_orders_data',
];

export const SUB_USER_PROFILE_COLUMNS = [
  'tier',
  'status',
  'parent_agent_id',
  'override_rate',
  'sub_user_cap',
  'invited_by',
  'approved_at',
  'approved_by',
  'parent_since',
  'previous_parent_agent_id',
  'reassigned_by',
  'reassigned_at',
];
