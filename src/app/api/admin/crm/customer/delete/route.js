import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { actorFrom, moveToBin } from '@/lib/recycleBinServer';

export const runtime = 'nodejs';

/**
 * Remove every trace of one customer: their leads, carts and orders.
 *
 * This used to be three blanket deletes matched on an email or phone, with
 * nothing read first — so a typo in the identifier destroyed another
 * customer's orders with no way back. Everything now goes through the Bin: the
 * matching rows are read, snapshotted and then deleted, and the reply says how
 * many of each went so the person can see straight away if the count looks
 * wrong.
 *
 * Still superadmin-only. The Bin makes it recoverable, not routine.
 */

/** The column each table identifies a customer by. */
const CUSTOMER_TABLES = [
  { table: 'catalog_leads', email: 'email', phone: 'phone', name: 'name' },
  { table: 'abandoned_carts', email: 'customer_email', phone: 'customer_phone', name: 'customer_name' },
  { table: 'orders', email: 'customer_email', phone: 'customer_phone', name: 'customer_name' },
];

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  // We restrict hard deletion to superadmins to prevent accidental data loss
  if (!auth.profile.is_superadmin) {
    return NextResponse.json({ error: 'Only superadmins can permanently delete customer data.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email, phone, name } = body;

    // We need at least one identifier to delete by
    if (!email && !phone && !name) {
      return NextResponse.json({ error: 'At least one identifier (email, phone, or name) is required to delete a customer.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const actor = actorFrom(auth.profile);
    const reason = `Customer data removed (${email || phone || name})`;

    const removed = {};
    const problems = [];

    for (const config of CUSTOMER_TABLES) {
      const column = email ? config.email : phone ? config.phone : config.name;
      const value = email || phone || name;

      // Read the ids first. moveToBin works from rows it has actually seen,
      // which is what lets each one be snapshotted individually.
      const { data, error } = await supabase
        .from(config.table)
        .select('id')
        .eq(column, value);

      if (error) {
        console.error(`[admin/crm/customer/delete] read ${config.table}`, error);
        problems.push(`${config.table}: ${error.message}`);
        removed[config.table] = 0;
        continue;
      }

      const ids = (data || []).map((row) => row.id);
      if (ids.length === 0) {
        removed[config.table] = 0;
        continue;
      }

      const binned = await moveToBin({ table: config.table, ids, actor, reason }, supabase);
      if (!binned.ok) {
        console.error(`[admin/crm/customer/delete] bin ${config.table}`, binned.error);
        problems.push(`${config.table}: ${binned.error}`);
        removed[config.table] = 0;
        continue;
      }
      removed[config.table] = binned.moved;
    }

    const total = Object.values(removed).reduce((sum, count) => sum + count, 0);

    if (problems.length > 0 && total === 0) {
      return NextResponse.json(
        { error: `Nothing was deleted. ${problems.join('; ')}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      removed,
      warnings: problems,
      message: total === 0
        ? 'No records matched that customer — nothing was deleted.'
        : `${total} record${total === 1 ? '' : 's'} moved to the Bin. Restore them from the Bin tab if this was a mistake.`,
    });
  } catch (error) {
    console.error('[admin/crm/customer/delete]', error);
    return NextResponse.json({ error: error.message || 'Could not delete customer' }, { status: 500 });
  }
}
