import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  isProspectsTableMissing,
  mergeRediscoveredProspect,
  normalizeProspectInput,
  normalizeOptionalProspectDate,
  prospectInputError,
  PROSPECT_STATUSES,
} from '@/lib/prospects.mjs';
import { normalizeProspectOwnerEmail } from '@/lib/prospectOwnership.mjs';
import { presentProspect } from '@/lib/prospectReadiness.mjs';
import {
  CHANNEL_PERMISSION_BASIS,
  PROSPECT_PERMISSION_CHANNELS,
  channelPermissionFields,
} from '@/lib/prospectPermissions.mjs';

export const dynamic = 'force-dynamic';
// A hundred saves is a hundred row writes plus the lookups that precede them.
export const maxDuration = 60;

const MAX_BATCH = 100;

const SELECT_FIELDS = [
  'id', 'source_provider', 'source_external_id', 'organization_name', 'category',
  'website_url', 'phone', 'email', 'formatted_address', 'city', 'region', 'country',
  'latitude', 'longitude', 'google_maps_url', 'rating', 'user_rating_count',
  'business_status', 'status', 'fit_score', 'fit_reasons', 'contact_permission_status',
  'contact_source_url', 'enriched_at', 'people', 'linkedin_urls', 'whatsapp_numbers',
  'email_permission_status', 'email_permission_basis', 'email_permission_source_url',
  'email_permission_evidence', 'email_permission_verified_at', 'email_permission_verified_by',
  'whatsapp_permission_status', 'whatsapp_permission_basis', 'whatsapp_permission_source_url',
  'whatsapp_permission_evidence', 'whatsapp_permission_verified_at', 'whatsapp_permission_verified_by',
  'owner_email', 'notes', 'last_contacted_at',
  'next_follow_up_at', 'created_at', 'updated_at',
].join(',');

const setupRequired = (migration = 'prospector-migration.sql') => NextResponse.json(
  { error: `Run ${migration} first.`, setupRequired: true },
  { status: 503 },
);

/**
 * Finds which of these businesses are already in the pipeline, in one query
 * per source rather than one per business.
 *
 * The single-prospect POST does a `maybeSingle` lookup before every save. Run
 * eighty times for a bulk save that is eighty serial round-trips before any
 * row is written, which is most of the reason bulk saving was worth adding.
 */
async function findExisting(supabase, inputs) {
  const byProvider = new Map();
  for (const input of inputs) {
    if (!input.source_external_id) continue;
    if (!byProvider.has(input.source_provider)) byProvider.set(input.source_provider, new Set());
    byProvider.get(input.source_provider).add(input.source_external_id);
  }

  const existing = new Map();
  for (const [provider, ids] of byProvider) {
    const { data, error } = await supabase
      .from('sales_prospects')
      .select(SELECT_FIELDS)
      .eq('source_provider', provider)
      .in('source_external_id', [...ids]);
    if (error) throw error;
    for (const row of data || []) {
      existing.set(`${row.source_provider}:${row.source_external_id}`, row);
    }
  }
  return existing;
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const candidates = Array.isArray(body.prospects) ? body.prospects : [];
  if (!candidates.length) return NextResponse.json({ error: 'No prospects to save' }, { status: 400 });
  if (candidates.length > MAX_BATCH) {
    return NextResponse.json({ error: `Save at most ${MAX_BATCH} prospects per batch` }, { status: 400 });
  }

  const inputs = [];
  const failed = [];
  for (const candidate of candidates) {
    const validationError = prospectInputError(candidate);
    if (validationError) {
      failed.push({ organization_name: candidate?.organization_name || 'Unnamed business', error: validationError });
      continue;
    }
    const input = normalizeProspectInput(candidate);
    if (!input.organization_name) {
      failed.push({ organization_name: 'Unnamed business', error: 'Organization name is required' });
      continue;
    }
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      failed.push({ organization_name: input.organization_name, error: 'Invalid work email' });
      continue;
    }
    inputs.push(input);
  }

  const supabase = getSupabaseAdmin();
  let existing;
  try {
    existing = await findExisting(supabase, inputs);
  } catch (error) {
    if (isProspectsTableMissing(error)) return setupRequired();
    console.error('[Prospects] Bulk lookup failed:', error.message);
    return NextResponse.json({ error: 'Unable to save prospects' }, { status: 500 });
  }

  const now = new Date().toISOString();
  const toInsert = [];
  const toUpdate = [];
  for (const input of inputs) {
    const match = input.source_external_id
      ? existing.get(`${input.source_provider}:${input.source_external_id}`)
      : null;
    if (match) {
      // Same rule as the single save: directory details refresh, everything a
      // person typed or decided survives.
      const { id, created_at: createdAt, ...merged } = mergeRediscoveredProspect(match, input);
      toUpdate.push({ id: match.id, row: { ...merged, updated_at: now } });
    } else {
      toInsert.push({ ...input, updated_at: now, created_by: auth.user.id });
    }
  }

  const saved = [];
  let created = 0;
  let refreshed = 0;

  if (toInsert.length) {
    const { data, error } = await supabase.from('sales_prospects').insert(toInsert).select(SELECT_FIELDS);
    if (isProspectsTableMissing(error)) return setupRequired();
    if (error) {
      console.error('[Prospects] Bulk insert failed:', error.message);
      // One bad row rejects the whole statement, so the batch is retried a row
      // at a time to save everything that can be saved and name what cannot.
      for (const row of toInsert) {
        const single = await supabase.from('sales_prospects').insert(row).select(SELECT_FIELDS).single();
        if (single.error) {
          failed.push({
            organization_name: row.organization_name,
            error: single.error.code === '23505' ? 'Already saved' : 'Unable to save',
          });
        } else {
          saved.push(single.data);
          created += 1;
        }
      }
    } else {
      saved.push(...(data || []));
      created += (data || []).length;
    }
  }

  if (toUpdate.length) {
    // Preserve database-managed columns by issuing updates, but run a bounded
    // group at once instead of making a large refresh wait on 100 serial trips.
    for (let index = 0; index < toUpdate.length; index += 10) {
      const group = toUpdate.slice(index, index + 10);
      const results = await Promise.all(group.map(({ id, row }) => supabase
        .from('sales_prospects')
        .update(row)
        .eq('id', id)
        .select(SELECT_FIELDS)
        .single()
        .then((result) => ({ ...result, row }))));
      for (const result of results) {
        if (result.error) {
          console.error('[Prospects] Bulk refresh failed:', result.error.message);
          failed.push({ organization_name: result.row.organization_name, error: 'Unable to refresh' });
        } else {
          saved.push(result.data);
          refreshed += 1;
        }
      }
    }
  }

  return NextResponse.json({ saved: saved.map(presentProspect), failed, created, refreshed });
}

/**
 * Applies one change to many prospects.
 *
 * Deliberately narrow: only the pipeline fields a rep changes in sweeps. Notes
 * and contact details are per-business by nature and stay on the single-row
 * PATCH.
 */
export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: 'Select at least one prospect' }, { status: 400 });
  if (ids.length > MAX_BATCH) {
    return NextResponse.json({ error: `Update at most ${MAX_BATCH} prospects per batch` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (body.action === 'claim') {
    const claimant = normalizeProspectOwnerEmail(auth.profile?.email || auth.user?.email);
    if (!claimant) {
      return NextResponse.json({ error: 'Your admin profile needs an email before you can claim prospects' }, { status: 400 });
    }

    const { data: newlyClaimed, error: claimError } = await supabase
      .from('sales_prospects')
      .update({ owner_email: claimant, updated_at: new Date().toISOString() })
      .in('id', ids)
      .is('owner_email', null)
      .select('id');
    if (isProspectsTableMissing(claimError)) return setupRequired();
    if (claimError) {
      console.error('[Prospects] Bulk claim failed:', claimError.message);
      return NextResponse.json({ error: 'Unable to claim prospects' }, { status: 500 });
    }

    // Return every selected row so stale clients immediately learn who owns
    // conflicts, while `claimedIds` identifies only rows this request won.
    const { data: currentRows, error: currentError } = await supabase
      .from('sales_prospects')
      .select(SELECT_FIELDS)
      .in('id', ids);
    if (currentError) {
      console.error('[Prospects] Bulk claim refresh failed:', currentError.message);
      return NextResponse.json({ error: 'Claims were processed but ownership could not be refreshed' }, { status: 500 });
    }
    const claimedIds = (newlyClaimed || []).map((row) => row.id);
    const alreadyMine = (currentRows || []).filter((row) => (
      !claimedIds.includes(row.id)
      && normalizeProspectOwnerEmail(row.owner_email) === claimant
    )).length;
    const conflicts = (currentRows || []).filter((row) => (
      normalizeProspectOwnerEmail(row.owner_email)
      && normalizeProspectOwnerEmail(row.owner_email) !== claimant
    )).length;
    return NextResponse.json({
      prospects: (currentRows || []).map(presentProspect),
      claimedIds,
      claimed: claimedIds.length,
      alreadyMine,
      conflicts,
    });
  }

  if ('owner_email' in body) {
    return NextResponse.json({ error: 'Use the protected claim action to assign prospects' }, { status: 400 });
  }

  if ('contact_permission_status' in body || 'channel_permissions' in body) {
    return NextResponse.json({ error: 'Review permission evidence on each prospect separately' }, { status: 400 });
  }

  const updates = {};
  if (PROSPECT_STATUSES.includes(body.status)) updates.status = body.status;
  if (updates.status === 'do_not_contact') {
    const verifiedAt = new Date().toISOString();
    updates.contact_permission_status = 'do_not_contact';
    for (const channel of PROSPECT_PERMISSION_CHANNELS) {
      const fields = channelPermissionFields(channel);
      Object.assign(updates, {
        [fields.status]: 'do_not_contact',
        [fields.basis]: CHANNEL_PERMISSION_BASIS.do_not_contact,
        [fields.evidence]: 'Blocked from a bulk prospect status change',
        [fields.verifiedAt]: verifiedAt,
        [fields.verifiedBy]: auth.user.id,
      });
    }
  }
  if ('next_follow_up_at' in body) {
    const followUp = normalizeOptionalProspectDate(body.next_follow_up_at);
    if (body.next_follow_up_at && !followUp) {
      return NextResponse.json({ error: 'Enter a valid follow-up date' }, { status: 400 });
    }
    updates.next_follow_up_at = followUp;
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('sales_prospects')
    .update(updates)
    .in('id', ids)
    .select(SELECT_FIELDS);

  if (isProspectsTableMissing(error)) return setupRequired();
  if (error) {
    console.error('[Prospects] Bulk update failed:', error.message);
    return NextResponse.json({ error: 'Unable to update prospects' }, { status: 500 });
  }
  return NextResponse.json({ prospects: (data || []).map(presentProspect) });
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // Keep accepting the old query-string form while deployed clients update.
  }
  const legacyIds = (new URL(request.url).searchParams.get('ids') || '').split(',');
  const ids = (Array.isArray(body.ids) ? body.ids : legacyIds).map((id) => String(id || '').trim()).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: 'Select at least one prospect' }, { status: 400 });
  if (ids.length > MAX_BATCH) {
    return NextResponse.json({ error: `Delete at most ${MAX_BATCH} prospects per batch` }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('sales_prospects')
    .delete()
    .in('id', ids)
    .select('id');
  if (isProspectsTableMissing(error)) return setupRequired();
  if (error) {
    console.error('[Prospects] Bulk delete failed:', error.message);
    return NextResponse.json({ error: 'Unable to delete prospects' }, { status: 500 });
  }
  const deleted = (data || []).map((row) => row.id);
  return NextResponse.json({ success: true, deleted });
}
