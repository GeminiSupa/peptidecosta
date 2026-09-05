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

import { missingColumnFrom, NOTIFICATION_PREFERENCE_COLUMNS } from './notificationPreferences.mjs';

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

/**
 * admin_profiles columns that arrive via their own hand-run migration:
 * avatar_url (team-profile-avatars-migration.sql), the pay fields
 * (add-commission-rate-to-profiles.sql) and the notification preferences
 * (add-notification-preferences-to-profiles.sql).
 *
 * Editing a team member writes the whole form in one row, so before this list
 * existed a single un-run migration failed the entire save — someone ticking
 * the Live Chat permission got "Could not find the 'avatar_url' column of
 * 'admin_profiles' in the schema cache" and the permission never landed.
 * Permissions and roles must never be hostage to an optional column.
 */
export const ADMIN_PROFILE_OPTIONAL_COLUMNS = [
  'avatar_url',
  'commission_rate',
  'weekly_salary',
  'salary_currency',
  'commission_structure',
  ...NOTIFICATION_PREFERENCE_COLUMNS,
];

/** Columns added by add-sub-user-tier.sql and add-sub-user-override-to-payouts.sql. */
export const SUB_USER_PAYOUT_COLUMNS = [
  'agent_tier',
  'override_rate',
  'override_usd',
  'override_crc',
  'override_sales_usd',
  'override_sales_crc',
  'override_orders_data',
  // Refund clawbacks — arrive via add-order-refunds.sql. Dropped rather than
  // failing the write, so a deploy that lands before the SQL is pasted in
  // cannot take down the weekly scan for everyone. The pay is simply not
  // reduced until the migration is run.
  'adjustment_usd',
  'adjustment_crc',
  'adjustments_data',
  'adjustment_carried_usd',
  'adjustment_carried_crc',
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

export const ORDER_ATTRIBUTION_COLUMNS = [
  'affiliate_id',
  'affiliate_commission_usd',
  'affiliate_commission_crc',
  'agent_commission_rate_override',
  'agent_commission_source',
  'affiliate_whatsapp_notified_at',
  'affiliate_whatsapp_message_id',
];

/**
 * What add-inventory-restore.sql adds, which the storefront already writes
 * defensively and the admin routes did not.
 *
 * The reservation itself is not optional — stock is deducted either way. These
 * two columns only record what was taken, so a later restore can be exact. A
 * deploy that arrives before the migration is pasted in should therefore lose
 * the record, not the edit: an admin changing the items on an order for a
 * customer who wants something else got "Could not find the 'inventory_deducted'
 * column of 'orders' in the schema cache" and could not save at all.
 */
export const ORDER_INVENTORY_COLUMNS = [
  'inventory_deducted',
  'inventory_restored_at',
];

/** Columns added by fulfillment-migration.sql. */
export const ORDER_FULFILLMENT_COLUMNS = [
  'ready_to_prepare_at',
  'ready_to_prepare_by',
];

/**
 * Columns added by add-manual-order-discounts.sql.
 *
 * A manual order can now carry a negotiated discount from the moment it is
 * created, which means the create route writes these on every order rather
 * than only when staff edit one. That must not become a new way for an un-run
 * migration to block order entry altogether: without the SQL the discount is
 * simply not recorded, and the order still saves at its discounted total.
 */
export const ORDER_MANUAL_DISCOUNT_COLUMNS = [
  'manual_discount_type',
  'manual_discount_value',
  'manual_discount_reason',
  'manual_discount_amount_usd',
  'manual_discount_amount_crc',
];

/**
 * What add-order-volume-discount-flag.sql adds.
 *
 * One nullable column recording whether staff chose to apply the automatic
 * volume discount on a manual order. Without the migration the choice simply
 * is not remembered between edits — which must never be a reason an order
 * cannot be saved at all.
 */
export const ORDER_VOLUME_DISCOUNT_COLUMNS = ['apply_volume_discount'];

/**
 * What add-review-platform.sql adds.
 *
 * Records which review site an order was asked for, so the month's Trustpilot
 * invitations can be counted against the plan's cap. Without the migration the
 * count falls back to every stamped order in the month, which over-counts and
 * therefore sends more orders to Google — the safe direction, since the failure
 * it exists to prevent is exceeding Trustpilot's allowance.
 *
 * It must never block the completion email: the customer's receipt matters more
 * than the record of which site they were pointed at.
 */
export const ORDER_REVIEW_PLATFORM_COLUMNS = ['review_platform'];
