/**
 * Moving rows into the Bin, putting them back, and erasing the expired ones.
 *
 * The rules about what belongs in the Bin and how long it stays live in
 * src/lib/recycleBin.mjs, which is pure and tested. This file is the half that
 * touches the database, and it only ever runs on the server with the service
 * role.
 *
 * Every admin delete should call `moveToBin` instead of `.delete()` directly.
 * Machine housekeeping should not — see the note at the top of recycleBin.mjs.
 */

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  DEFAULT_RETENTION_DAYS,
  RECYCLE_BIN_SETTINGS_ID,
  childTablesFor,
  describeRecord,
  isAllowedIdColumn,
  isBinnableTable,
  readRetention,
  recordTypeFor,
  selectExpired,
} from '@/lib/recycleBin.mjs';

/** Postgres says why it refused; pass that on instead of a bare message. */
function describeDbError(error, fallback) {
  const parts = [error?.message || fallback];
  if (error?.details) parts.push(error.details);
  if (error?.code === '23503') {
    parts.push('Another record still references this one.');
  }
  return parts.filter(Boolean).join(' — ');
}

/** The name and email to stamp on a Bin entry, from a verified admin session. */
export function actorFrom(profile) {
  return {
    name: profile?.name || profile?.email || 'Unknown',
    email: profile?.email || null,
  };
}

/**
 * Read how long the Bin holds things.
 *
 * A read failure returns the default rather than throwing: the purge job
 * skipping a night is recoverable, but a delete refused because the setting
 * could not be read would block the admin from working at all.
 */
export async function getRetention(supabase = getSupabaseAdmin()) {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('id', RECYCLE_BIN_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    console.error('[recycle-bin] could not read retention, using default', error);
    return { days: DEFAULT_RETENTION_DAYS, neverPurge: false, updatedAt: null, updatedBy: null };
  }
  return readRetention(data?.value);
}

/** Write a new retention. The superadmin check belongs to the calling route. */
export async function setRetention(
  { days, neverPurge, actor },
  supabase = getSupabaseAdmin(),
) {
  const value = {
    retention_days: neverPurge ? null : days,
    updated_at: new Date().toISOString(),
    updated_by: actor?.name || null,
  };

  const { error } = await supabase
    .from('site_settings')
    .upsert({ id: RECYCLE_BIN_SETTINGS_ID, value }, { onConflict: 'id' });

  if (error) {
    return { ok: false, error: describeDbError(error, 'Could not save the retention period') };
  }
  return { ok: true, retention: readRetention(value) };
}

/**
 * Snapshot rows into the Bin, then delete them.
 *
 * Order matters and is the whole safety story: the rows are read, then written
 * to the Bin, and only then deleted. If the delete is refused — a foreign key
 * still pointing at the row is the usual reason — the Bin entries written a
 * moment ago are removed again, so the Bin never lists something that is still
 * live in its own table. Doing it the other way round meant a failed Bin write
 * after a successful delete erased the row for good.
 *
 * Returns { ok, moved, entries, rows, error }. `rows` is what was snapshotted,
 * so a caller that needs the deleted row (to restore its stock, say) does not
 * have to read it a second time.
 */
export async function moveToBin(
  { table, ids, idColumn = 'id', actor, reason = null },
  supabase = getSupabaseAdmin(),
) {
  const sourceTable = String(table || '').trim();
  const targetIds = (Array.isArray(ids) ? ids : [ids]).filter((id) => id !== null && id !== undefined);

  if (!isBinnableTable(sourceTable)) {
    // Refused rather than silently deleted: a table missing from the registry
    // is a table whose restore nobody has thought about yet.
    return { ok: false, error: `${sourceTable || 'That table'} is not covered by the Bin.` };
  }
  if (targetIds.length === 0) {
    return { ok: false, error: 'Nothing was selected to delete.' };
  }
  if (!isAllowedIdColumn(sourceTable, idColumn)) {
    // The column name is interpolated into the query, so it never comes from
    // the caller unchecked.
    return { ok: false, error: `${sourceTable} cannot be matched on ${idColumn}.` };
  }

  // Selected whole. Naming columns would break the moment a table gains one,
  // and the Bin's entire job is to hold the row exactly as it was.
  const { data: rows, error: readError } = await supabase
    .from(sourceTable)
    .select('*')
    .in(idColumn, targetIds);

  if (readError) {
    return { ok: false, error: describeDbError(readError, 'Could not read the records') };
  }
  if (!rows || rows.length === 0) {
    return { ok: false, error: 'Those records no longer exist.', notFound: true };
  }

  // Child rows the database cascade would take with the parent. Gathered
  // before the delete, because afterwards there is nothing left to gather.
  const relatedByParent = new Map();
  for (const child of childTablesFor(sourceTable)) {
    const parentIds = rows.map((row) => row.id);
    const { data: childRows, error: childError } = await supabase
      .from(child.table)
      .select('*')
      .in(child.foreignKey, parentIds);

    if (childError) {
      // A child table that does not exist in this database yet is not fatal —
      // the parent is still worth keeping. A real read failure is, because
      // deleting now would lose the children silently.
      if (childError.code === '42P01') {
        console.warn(`[recycle-bin] ${child.table} missing, parent snapshot only`);
        continue;
      }
      return { ok: false, error: describeDbError(childError, `Could not read ${child.table}`) };
    }

    for (const childRow of childRows || []) {
      const key = String(childRow[child.foreignKey]);
      if (!relatedByParent.has(key)) relatedByParent.set(key, {});
      const bucket = relatedByParent.get(key);
      if (!bucket[child.table]) bucket[child.table] = [];
      bucket[child.table].push(childRow);
    }
  }

  const entries = rows.map((row) => ({
    source_table: sourceTable,
    source_id: String(row.id),
    record_type: recordTypeFor(sourceTable),
    label: describeRecord(sourceTable, row),
    payload: row,
    related: relatedByParent.get(String(row.id)) || {},
    deleted_by_name: actor?.name || null,
    deleted_by_email: actor?.email || null,
    delete_reason: reason,
  }));

  const { data: written, error: binError } = await supabase
    .from('deleted_records')
    .insert(entries)
    .select('id');

  if (binError) {
    return { ok: false, error: describeDbError(binError, 'Could not write to the Bin') };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from(sourceTable)
    .delete()
    .in(idColumn, rows.map((row) => row[idColumn]))
    .select('id');

  const binIds = (written || []).map((entry) => entry.id);

  if (deleteError || !deleted || deleted.length === 0) {
    // Put the Bin back how it was. The row is still live, and an entry left
    // here would offer a restore for something that was never deleted.
    if (binIds.length > 0) {
      await supabase.from('deleted_records').delete().in('id', binIds);
    }
    return {
      ok: false,
      error: deleteError
        ? describeDbError(deleteError, 'Could not delete the records')
        : 'The database accepted the delete but removed nothing.',
    };
  }

  return { ok: true, moved: deleted.length, entries: binIds, rows };
}

/**
 * Put a binned row back in its own table.
 *
 * The id goes back with it, so anything that pointed at the row by id lines up
 * again. If something has since taken that id, the restore is refused rather
 * than overwriting it — a 23505 here means the record was recreated by hand
 * while it sat in the Bin, and clobbering that is worse than refusing.
 */
export async function restoreFromBin({ entryId, actor }, supabase = getSupabaseAdmin()) {
  const { data: entry, error: readError } = await supabase
    .from('deleted_records')
    .select('*')
    .eq('id', entryId)
    .maybeSingle();

  if (readError) {
    return { ok: false, error: describeDbError(readError, 'Could not read the Bin entry') };
  }
  if (!entry) return { ok: false, error: 'That item is no longer in the Bin.' };
  if (entry.restored_at) {
    return { ok: false, error: 'That item has already been restored.' };
  }

  const { error: insertError } = await supabase
    .from(entry.source_table)
    .insert(entry.payload);

  if (insertError) {
    if (insertError.code === '23505') {
      return {
        ok: false,
        error: `A ${entry.record_type.toLowerCase()} with this id already exists — it was recreated while this sat in the Bin. Nothing was changed.`,
      };
    }
    return { ok: false, error: describeDbError(insertError, 'Could not restore the record') };
  }

  // Children go back after the parent, or the foreign key has nothing to point
  // at. A child that fails is reported but does not roll the parent back: half
  // an order restored is worth more than none, and the Bin entry stays put so
  // the rest can be retried.
  const childProblems = [];
  for (const [childTable, childRows] of Object.entries(entry.related || {})) {
    if (!Array.isArray(childRows) || childRows.length === 0) continue;
    const { error: childError } = await supabase.from(childTable).insert(childRows);
    if (childError) {
      console.error(`[recycle-bin] restoring ${childTable} failed`, childError);
      childProblems.push(`${childTable}: ${childError.message}`);
    }
  }

  const { error: markError } = await supabase
    .from('deleted_records')
    .update({
      restored_at: new Date().toISOString(),
      restored_by_name: actor?.name || null,
      restored_by_email: actor?.email || null,
    })
    .eq('id', entryId);

  if (markError) {
    console.error('[recycle-bin] restored but could not mark the entry', entryId, markError);
  }

  return {
    ok: true,
    restored: { table: entry.source_table, id: entry.source_id, label: entry.label },
    warnings: childProblems,
  };
}

/**
 * Erase Bin entries past their retention.
 *
 * This is the only place anything is destroyed for good. It asks for candidates
 * by date and then re-checks each one through selectExpired, so the decision
 * about what "expired" means stays in the tested module rather than being
 * re-implemented as a SQL interval here.
 */
export async function purgeExpired({ limit = 500 } = {}, supabase = getSupabaseAdmin()) {
  const retention = await getRetention(supabase);
  if (retention.neverPurge) {
    return { ok: true, purged: 0, skipped: 'retention is set to never purge' };
  }

  const { data: candidates, error } = await supabase
    .from('deleted_records')
    .select('id, deleted_at, restored_at, source_table, label')
    .is('restored_at', null)
    .order('deleted_at', { ascending: true })
    .limit(limit);

  if (error) {
    return { ok: false, error: describeDbError(error, 'Could not read the Bin') };
  }

  const expired = selectExpired(candidates || [], retention);
  if (expired.length === 0) return { ok: true, purged: 0 };

  const { error: purgeError } = await supabase
    .from('deleted_records')
    .delete()
    .in('id', expired.map((entry) => entry.id));

  if (purgeError) {
    return { ok: false, error: describeDbError(purgeError, 'Could not empty the Bin') };
  }

  console.log(`[recycle-bin] purged ${expired.length} entries past ${retention.days} days`);
  return { ok: true, purged: expired.length };
}
