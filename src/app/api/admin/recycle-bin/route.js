import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { resolveAdminTabAccess } from '@/lib/adminModules';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  canTouchEntry,
  recordTypeFor,
  summarizeEntry,
  visibleTablesFor,
} from '@/lib/recycleBin.mjs';
import { actorFrom, getRetention, restoreFromBin } from '@/lib/recycleBinServer';

export const dynamic = 'force-dynamic';

/**
 * Reading the Bin, and putting things back.
 *
 * Every entry is filtered against the module it came from, so the Bin never
 * shows somebody a deleted order when the Orders tab is closed to them. That
 * check is applied on the way out AND again on restore — the list narrowing is
 * a convenience, the restore check is the actual lock.
 */

const PAGE_SIZE = 100;

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const canAccess = (permission) => resolveAdminTabAccess(permission, auth.profile);
  const allowedTables = visibleTablesFor(canAccess);

  if (allowedTables.length === 0) {
    return NextResponse.json({ entries: [], retention: await getRetention(), types: [] });
  }

  const url = new URL(request.url);
  const typeFilter = (url.searchParams.get('table') || '').trim();
  const search = (url.searchParams.get('q') || '').trim();
  const includeRestored = url.searchParams.get('restored') === '1';

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('deleted_records')
    .select('id, source_table, source_id, record_type, label, deleted_at, deleted_by_name, delete_reason, restored_at, restored_by_name')
    .in('source_table', typeFilter && allowedTables.includes(typeFilter) ? [typeFilter] : allowedTables)
    .order('deleted_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (!includeRestored) query = query.is('restored_at', null);
  if (search) query = query.ilike('label', `%${search}%`);

  const [{ data, error }, retention] = await Promise.all([query, getRetention(supabase)]);

  if (error) {
    // The table missing means add-recycle-bin.sql has not been run yet. Say so
    // plainly rather than showing an empty Bin, which would read as "nothing
    // was ever deleted" — the one reading that is never true.
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'The Bin table does not exist yet. Run add-recycle-bin.sql.' },
        { status: 503 },
      );
    }
    console.error('[recycle-bin] list failed', error);
    return NextResponse.json({ error: 'Could not read the Bin' }, { status: 500 });
  }

  const entries = (data || []).map((entry) => {
    const summary = summarizeEntry(entry, retention);
    return {
      ...entry,
      record_type: entry.record_type || recordTypeFor(entry.source_table),
      purge_at: summary.purgeAt ? summary.purgeAt.toISOString() : null,
      days_left: summary.daysLeft,
      expired: summary.expired,
    };
  });

  return NextResponse.json({
    entries,
    retention,
    canChangeRetention: Boolean(auth.profile.is_superadmin),
    types: allowedTables.map((table) => ({ table, type: recordTypeFor(table) })),
  });
}

/** Restore one entry. Body: { entryId }. */
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const entryId = String(body?.entryId || '').trim();
  if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: entry, error } = await supabase
    .from('deleted_records')
    .select('id, source_table, label')
    .eq('id', entryId)
    .maybeSingle();

  if (error) {
    console.error('[recycle-bin] restore lookup failed', entryId, error);
    return NextResponse.json({ error: 'Could not read the Bin entry' }, { status: 500 });
  }
  if (!entry) return NextResponse.json({ error: 'That item is no longer in the Bin.' }, { status: 404 });

  const canAccess = (permission) => resolveAdminTabAccess(permission, auth.profile);
  if (!canTouchEntry(entry, canAccess)) {
    return NextResponse.json(
      { error: 'You do not have access to the section this item came from.' },
      { status: 403 },
    );
  }

  const result = await restoreFromBin({ entryId, actor: actorFrom(auth.profile) }, supabase);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  console.log(`[recycle-bin] ${entry.source_table}/${entry.label} restored by ${auth.profile.email}`);
  return NextResponse.json(result);
}

/**
 * Erase one entry for good, ahead of its date. Body: { entryId }.
 *
 * Superadmin only. Everyone with the tab can put something back; only the owner
 * can make it unrecoverable, which is the same line the retention setting sits
 * on.
 */
export async function DELETE(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const entryId = String(body?.entryId || '').trim();
  const emptyAll = body?.emptyAll === true;

  const supabase = getSupabaseAdmin();

  if (emptyAll) {
    const { data, error } = await supabase
      .from('deleted_records')
      .delete()
      .is('restored_at', null)
      .select('id');

    if (error) {
      console.error('[recycle-bin] empty failed', error);
      return NextResponse.json({ error: 'Could not empty the Bin' }, { status: 500 });
    }
    console.log(`[recycle-bin] emptied (${data?.length || 0}) by ${auth.profile.email}`);
    return NextResponse.json({ success: true, purged: data?.length || 0 });
  }

  if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('deleted_records')
    .delete()
    .eq('id', entryId)
    .select('id, label');

  if (error) {
    console.error('[recycle-bin] purge one failed', entryId, error);
    return NextResponse.json({ error: 'Could not erase that item' }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'That item is no longer in the Bin.' }, { status: 404 });
  }

  console.log(`[recycle-bin] ${data[0].label} erased by ${auth.profile.email}`);
  return NextResponse.json({ success: true, purged: 1 });
}
