import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { resolveAdminTabAccess } from '@/lib/adminModules';
import {
  isAllowedIdColumn,
  isBinnableTable,
  permissionFor,
  recordTypeFor,
} from '@/lib/recycleBin.mjs';
import { actorFrom, moveToBin } from '@/lib/recycleBinServer';

export const dynamic = 'force-dynamic';

/**
 * The one door every admin delete goes through.
 *
 * Plenty of delete buttons in the dashboard used to call
 * `supabase.from(table).delete()` straight from the browser. That cannot write
 * to `deleted_records` — the Bin is service-role only, by design, because the
 * snapshots carry customer names and addresses. So those buttons post here
 * instead, and the row is snapshotted and deleted on the server.
 *
 * Body: { table, ids, reason? }
 *
 * The table is checked against the Bin registry rather than trusted, so a
 * tampered request cannot name `admin_profiles` and have it deleted by someone
 * whose own tab list does not include Team.
 */
export async function POST(request) {
  const auth = await verifyAdminSession(request, { skipPathPermission: true });
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const table = String(body?.table || '').trim();
  const ids = Array.isArray(body?.ids) ? body.ids : [body?.id].filter((id) => id != null);
  const reason = body?.reason ? String(body.reason).slice(0, 200) : null;
  const idColumn = String(body?.idColumn || 'id');

  if (!isBinnableTable(table)) {
    return NextResponse.json({ error: 'That kind of record cannot be deleted here.' }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Nothing was selected to delete.' }, { status: 400 });
  }
  if (!isAllowedIdColumn(table, idColumn)) {
    return NextResponse.json({ error: 'That record cannot be matched that way.' }, { status: 400 });
  }

  // The permission of the module the row belongs to — not of this route. The
  // path rule maps /api/admin/recycle-bin to the Bin tab, which would let
  // anyone with the Bin delete from any table; that is why it is skipped above
  // and the real check is here, per table.
  const permission = permissionFor(table);
  if (!permission || !resolveAdminTabAccess(permission, auth.profile)) {
    return NextResponse.json(
      { error: `You do not have access to delete a ${recordTypeFor(table).toLowerCase()}.` },
      { status: 403 },
    );
  }

  const result = await moveToBin({ table, ids, idColumn, actor: actorFrom(auth.profile), reason });

  if (!result.ok) {
    const status = result.notFound ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  console.log(`[recycle-bin] ${result.moved} x ${table} binned by ${auth.profile.email}`);
  return NextResponse.json({
    success: true,
    moved: result.moved,
    message: `Moved to the Bin. You can restore it from the Bin tab.`,
  });
}
