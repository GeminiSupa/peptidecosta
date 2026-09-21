import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import {
  BIN_ENTITY_TYPES,
  isKnownBinEntity,
  isMissingBinTable,
  restoreTarget,
} from '@/lib/adminBin.mjs';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

function describeDbError(error, fallback) {
  const parts = [error?.message || fallback];
  if (error?.details) parts.push(error.details);
  if (error?.hint) parts.push(error.hint);
  return parts.filter(Boolean).join(' — ');
}

function missingTableResponse() {
  return NextResponse.json({
    items: [],
    needsMigration: true,
    error: 'The Bin table is not installed yet. Run add-admin-bin.sql in Supabase.',
  }, { status: 503 });
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const entityType = String(searchParams.get('type') || '').trim();
  const supabase = getSupabaseAdmin();

  try {
    let query = supabase
      .from('admin_bin')
      .select('id, entity_type, entity_id, summary, deleted_by, deleted_at')
      .order('deleted_at', { ascending: false })
      .limit(400);

    if (entityType) {
      if (!isKnownBinEntity(entityType)) {
        return NextResponse.json({ error: 'Unknown bin type' }, { status: 400 });
      }
      query = query.eq('entity_type', entityType);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingBinTable(error)) return missingTableResponse();
      return NextResponse.json({ error: describeDbError(error, 'Could not load the bin') }, { status: 500 });
    }

    return NextResponse.json({ items: data || [], types: BIN_ENTITY_TYPES });
  } catch (err) {
    console.error('[admin/bin GET]', err);
    return NextResponse.json({ error: err.message || 'Could not load the bin' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const ids = Array.isArray(body?.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];
  const singleId = String(body?.id || '').trim();
  const restoreIds = ids.length ? ids : (singleId ? [singleId] : []);
  if (restoreIds.length === 0) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: items, error: readError } = await supabase
      .from('admin_bin')
      .select('*')
      .in('id', restoreIds);

    if (readError) {
      if (isMissingBinTable(readError)) return missingTableResponse();
      return NextResponse.json({ error: describeDbError(readError, 'Could not read the bin') }, { status: 500 });
    }
    if (!items?.length) {
      return NextResponse.json({ error: 'Nothing in the bin matched those ids' }, { status: 404 });
    }

    const restored = [];
    const failed = [];

    for (const item of items) {
      const target = restoreTarget(item);
      if (!target) {
        failed.push({ id: item.id, error: 'This bin entry has no restore snapshot' });
        continue;
      }
      const { error: insertError } = await supabase.from(target.table).insert(target.row);
      if (insertError) {
        failed.push({ id: item.id, error: describeDbError(insertError, 'Could not restore this item') });
        continue;
      }
      const { error: dropError } = await supabase.from('admin_bin').delete().eq('id', item.id);
      if (dropError) {
        failed.push({
          id: item.id,
          error: `Restored, but the bin copy could not be cleared: ${describeDbError(dropError, 'bin cleanup failed')}`,
        });
        continue;
      }
      restored.push({ id: item.id, entityType: item.entity_type, entityId: item.entity_id, summary: item.summary });
    }

    return NextResponse.json({
      ok: failed.length === 0,
      restored,
      failed,
    }, { status: failed.length && !restored.length ? 500 : 200 });
  } catch (err) {
    console.error('[admin/bin POST]', err);
    return NextResponse.json({ error: err.message || 'Could not restore from the bin' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    if (body?.all === true) {
      if (!auth.profile.is_superadmin) {
        return NextResponse.json({ error: 'Only a superadmin can empty the bin' }, { status: 403 });
      }
      const { error } = await supabase.from('admin_bin').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
        if (isMissingBinTable(error)) return missingTableResponse();
        return NextResponse.json({ error: describeDbError(error, 'Could not empty the bin') }, { status: 500 });
      }
      return NextResponse.json({ ok: true, emptied: true });
    }

    const ids = Array.isArray(body?.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];
    const singleId = String(body?.id || '').trim();
    const purgeIds = ids.length ? ids : (singleId ? [singleId] : []);
    if (purgeIds.length === 0) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data, error } = await supabase.from('admin_bin').delete().in('id', purgeIds).select('id');
    if (error) {
      if (isMissingBinTable(error)) return missingTableResponse();
      return NextResponse.json({ error: describeDbError(error, 'Could not remove from the bin') }, { status: 500 });
    }
    return NextResponse.json({ ok: true, deleted: data?.length || 0 });
  } catch (err) {
    console.error('[admin/bin DELETE]', err);
    return NextResponse.json({ error: err.message || 'Could not remove from the bin' }, { status: 500 });
  }
}
