import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  isProspectsTableMissing,
  mergeRediscoveredProspect,
  normalizeProspectInput,
  normalizeOptionalUrl,
  normalizeProspectPeople,
  normalizeLinkedInProfileUrls,
  normalizeOptionalProspectDate,
  normalizeWhatsAppNumbers,
  prospectInputError,
  scoreProspect,
  PROSPECT_STATUSES,
} from '@/lib/prospects.mjs';
import { normalizeProspectOwnerEmail } from '@/lib/prospectOwnership.mjs';
import { presentProspect } from '@/lib/prospectReadiness.mjs';
import {
  CHANNEL_PERMISSION_BASIS,
  CHANNEL_PERMISSION_STATUSES,
  PROSPECT_PERMISSION_CHANNELS,
  channelPermissionFields,
  summarizeChannelPermissions,
} from '@/lib/prospectPermissions.mjs';
import {
  CLOSED_PROSPECT_STATUSES,
  applyProspectPipelineFilters,
  parseProspectPipelineParams,
} from '@/lib/prospectPipeline.mjs';

export const dynamic = 'force-dynamic';

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

const missingTableResponse = () => NextResponse.json({
  prospects: [],
  total: 0,
  stats: { saved: 0, qualified: 0, due: 0, ready: 0, unassignedStrong: 0, needsVerification: 0 },
  setupRequired: true,
  migration: 'prospector-migration.sql',
});

async function loadPipelineStats(supabase, nowIso) {
  const count = (mode = 'exact') => supabase.from('sales_prospects').select('id', { count: mode, head: true });
  const active = (query) => query.not('status', 'in', `(${CLOSED_PROSPECT_STATUSES.join(',')})`);
  const [saved, qualified, due, ready, unassignedStrong, needsVerification] = await Promise.all([
    count(),
    count().eq('status', 'qualified'),
    active(count()).lte('next_follow_up_at', nowIso),
    active(count('planned')).or('and(email.not.is.null,email_permission_status.in.(business_contact,consented)),and(phone.not.is.null,whatsapp_permission_status.in.(business_contact,consented)),and(whatsapp_numbers.neq.[],whatsapp_permission_status.in.(business_contact,consented))'),
    active(count()).is('owner_email', null).gte('fit_score', 70),
    active(count('planned')).or('and(email.not.is.null,email_permission_status.eq.unknown),and(phone.not.is.null,whatsapp_permission_status.eq.unknown),and(whatsapp_numbers.neq.[],whatsapp_permission_status.eq.unknown)'),
  ]);
  const named = { saved, qualified, due, ready, unassignedStrong, needsVerification };
  for (const [name, result] of Object.entries(named)) {
    if (result.error) console.error(`[Prospects] ${name} count failed:`, result.error.message);
  }
  return {
    saved: saved.error ? null : saved.count || 0,
    qualified: qualified.error ? null : qualified.count || 0,
    due: due.error ? null : due.count || 0,
    ready: ready.error ? null : ready.count || 0,
    unassignedStrong: unassignedStrong.error ? null : unassignedStrong.count || 0,
    needsVerification: needsVerification.error ? null : needsVerification.count || 0,
  };
}

function channelPermissionUpdates(channel, input, auth, verifiedAt) {
  const fields = channelPermissionFields(channel);
  if (!fields || !input || typeof input !== 'object') return { error: `Invalid ${channel} permission` };
  const status = CHANNEL_PERMISSION_STATUSES.includes(input.status) ? input.status : null;
  if (!status) return { error: `Choose a valid ${channel} permission` };

  const rawSourceUrl = String(input.source_url || '').trim();
  const sourceUrl = normalizeOptionalUrl(rawSourceUrl);
  const evidence = String(input.evidence || '').trim().slice(0, 1000) || null;
  if (rawSourceUrl && !sourceUrl) return { error: `Enter a valid ${channel} evidence URL` };
  if (status === 'business_contact' && !sourceUrl) {
    return { error: `A source URL is required to verify the published ${channel} contact` };
  }
  if (status === 'consented' && !sourceUrl && !evidence) {
    return { error: `Record where or how ${channel} consent was received` };
  }

  if (status === 'unknown') {
    return {
      updates: {
        [fields.status]: status,
        [fields.basis]: null,
        [fields.sourceUrl]: null,
        [fields.evidence]: null,
        [fields.verifiedAt]: null,
        [fields.verifiedBy]: null,
      },
    };
  }
  return {
    updates: {
      [fields.status]: status,
      [fields.basis]: CHANNEL_PERMISSION_BASIS[status],
      [fields.sourceUrl]: sourceUrl,
      [fields.evidence]: evidence,
      [fields.verifiedAt]: verifiedAt,
      [fields.verifiedBy]: auth.user.id,
    },
  };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  const filters = parseProspectPipelineParams(params);
  const currentEmail = normalizeProspectOwnerEmail(auth.profile?.email || auth.user?.email);
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const baseQuery = supabase
    .from('sales_prospects')
    .select(SELECT_FIELDS, { count: 'exact' });
  const listQuery = applyProspectPipelineFilters(baseQuery, filters, currentEmail, nowIso)
    .range(filters.offset, filters.offset + filters.limit - 1);
  const [{ data, error, count }, statsResult] = await Promise.all([
    listQuery,
    loadPipelineStats(supabase, nowIso).catch((statsError) => {
      console.error('[Prospects] Stats failed:', statsError.message);
      return null;
    }),
  ]);

  if (isProspectsTableMissing(error)) return missingTableResponse();
  if (error) {
    console.error('[Prospects] List failed:', error.message);
    return NextResponse.json({ error: 'Unable to load prospects' }, { status: 500 });
  }

  return NextResponse.json({
    prospects: (data || []).map(presentProspect),
    total: count || 0,
    stats: statsResult ? { ...statsResult, saved: statsResult.saved ?? count ?? 0 } : { saved: count || 0 },
    setupRequired: false,
    hasMore: filters.offset + (data || []).length < (count || 0),
    nextOffset: filters.offset + (data || []).length,
  });
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
  const validationError = prospectInputError(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const input = normalizeProspectInput(body);
  if (!input.organization_name) {
    return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return NextResponse.json({ error: 'Enter a valid work email' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  for (const channel of PROSPECT_PERMISSION_CHANNELS) {
    const fields = channelPermissionFields(channel);
    if (input[fields.status] !== 'unknown') {
      input[fields.verifiedAt] = now;
      input[fields.verifiedBy] = auth.user.id;
    }
  }
  let row = { ...input, updated_at: now };
  let existingId = null;
  if (row.source_external_id) {
    const { data: existing, error: lookupError } = await supabase
      .from('sales_prospects')
      .select(SELECT_FIELDS)
      .eq('source_provider', row.source_provider)
      .eq('source_external_id', row.source_external_id)
      .maybeSingle();
    if (isProspectsTableMissing(lookupError)) {
      return NextResponse.json({ error: 'Run prospector-migration.sql first.', setupRequired: true }, { status: 503 });
    }
    if (lookupError) {
      console.error('[Prospects] Duplicate lookup failed:', lookupError.message);
      return NextResponse.json({ error: 'Unable to save prospect' }, { status: 500 });
    }
    existingId = existing?.id || null;
    // Saving an already-tracked business refreshes its directory details without
    // resetting the status, notes, owner or follow-up someone set on it.
    if (existing) {
      const { id, created_at, ...merged } = mergeRediscoveredProspect(existing, input);
      row = { ...merged, updated_at: row.updated_at };
    }
  }

  let query = supabase.from('sales_prospects');
  query = existingId
    ? query.update(row).eq('id', existingId)
    : query.insert({ ...row, created_by: auth.user.id });
  const { data, error } = await query.select(SELECT_FIELDS).single();

  if (isProspectsTableMissing(error)) {
    return NextResponse.json({ error: 'Run prospector-migration.sql first.', setupRequired: true }, { status: 503 });
  }
  if (error) {
    console.error('[Prospects] Save failed:', error.message);
    return NextResponse.json({ error: error.code === '23505' ? 'This prospect is already saved' : 'Unable to save prospect' }, { status: error.code === '23505' ? 409 : 500 });
  }
  return NextResponse.json({ prospect: presentProspect(data) }, { status: 201 });
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'Prospect ID is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (body.action === 'claim') {
    // Never trust a browser-supplied owner. The authenticated profile is the
    // claimant, and `owner_email IS NULL` makes competing claims atomic.
    const claimant = normalizeProspectOwnerEmail(auth.profile?.email || auth.user?.email);
    if (!claimant) {
      return NextResponse.json({ error: 'Your admin profile needs an email before you can claim prospects' }, { status: 400 });
    }

    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from('sales_prospects')
      .update({ owner_email: claimant, updated_at: claimedAt })
      .eq('id', body.id)
      .is('owner_email', null)
      .select(SELECT_FIELDS)
      .maybeSingle();

    if (isProspectsTableMissing(claimError)) {
      return NextResponse.json({ error: 'Run prospector-migration.sql first.', setupRequired: true }, { status: 503 });
    }
    if (claimError) {
      console.error('[Prospects] Claim failed:', claimError.message);
      return NextResponse.json({ error: 'Unable to claim prospect' }, { status: 500 });
    }
    if (claimed) return NextResponse.json({ prospect: presentProspect(claimed), claimed: true });

    // The conditional update affected no row: distinguish an idempotent claim,
    // a conflict, and a deleted/missing prospect without weakening the guard.
    const { data: current, error: currentError } = await supabase
      .from('sales_prospects')
      .select(SELECT_FIELDS)
      .eq('id', body.id)
      .maybeSingle();
    if (currentError) {
      console.error('[Prospects] Claim conflict lookup failed:', currentError.message);
      return NextResponse.json({ error: 'Unable to confirm prospect ownership' }, { status: 500 });
    }
    if (!current) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    if (normalizeProspectOwnerEmail(current.owner_email) === claimant) {
      return NextResponse.json({ prospect: presentProspect(current), claimed: false, alreadyOwned: true });
    }
    return NextResponse.json({
      error: `Already assigned to ${current.owner_email}`,
      prospect: presentProspect(current),
      claimed: false,
      conflict: true,
    }, { status: 409 });
  }

  if ('owner_email' in body) {
    return NextResponse.json({ error: 'Use the protected claim action to assign a prospect' }, { status: 400 });
  }

  if ('contact_permission_status' in body) {
    return NextResponse.json({ error: 'Set email and WhatsApp permission separately with evidence' }, { status: 400 });
  }

  const updates = {};
  if (PROSPECT_STATUSES.includes(body.status)) updates.status = body.status;
  if ('notes' in body) updates.notes = String(body.notes || '').trim().slice(0, 5000);
  if ('next_follow_up_at' in body) {
    const followUp = normalizeOptionalProspectDate(body.next_follow_up_at);
    if (body.next_follow_up_at && !followUp) {
      return NextResponse.json({ error: 'Enter a valid follow-up date' }, { status: 400 });
    }
    updates.next_follow_up_at = followUp;
  }
  if ('last_contacted_at' in body) updates.last_contacted_at = body.last_contacted_at || null;
  if ('email' in body) {
    const email = String(body.email || '').trim().toLowerCase().slice(0, 240);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid work email' }, { status: 400 });
    }
    updates.email = email || null;
  }
  if ('phone' in body) updates.phone = String(body.phone || '').trim().slice(0, 80) || null;
  if ('contact_source_url' in body) updates.contact_source_url = normalizeOptionalUrl(body.contact_source_url);
  if ('enriched_at' in body) updates.enriched_at = body.enriched_at || null;
  if ('people' in body) updates.people = normalizeProspectPeople(body.people);
  if ('linkedin_urls' in body) updates.linkedin_urls = normalizeLinkedInProfileUrls(body.linkedin_urls);
  if ('whatsapp_numbers' in body) updates.whatsapp_numbers = normalizeWhatsAppNumbers(body.whatsapp_numbers);
  updates.updated_at = new Date().toISOString();

  const requestedChannelPermissions = body.channel_permissions && typeof body.channel_permissions === 'object'
    ? PROSPECT_PERMISSION_CHANNELS.filter((channel) => Object.hasOwn(body.channel_permissions, channel))
    : [];
  const needsCurrent = 'email' in updates || 'phone' in updates
    || requestedChannelPermissions.length > 0
    || updates.status === 'do_not_contact';
  let current = null;
  if (needsCurrent) {
    const { data, error: currentError } = await supabase
      .from('sales_prospects')
      .select(SELECT_FIELDS)
      .eq('id', body.id)
      .single();
    if (currentError) {
      if (isProspectsTableMissing(currentError)) {
        return NextResponse.json({ error: 'Run prospector-migration.sql first.', setupRequired: true }, { status: 503 });
      }
      return NextResponse.json({ error: 'Unable to update prospect' }, { status: 500 });
    }
    current = data;
  }

  if (updates.status === 'do_not_contact') {
    for (const channel of PROSPECT_PERMISSION_CHANNELS) {
      const fields = channelPermissionFields(channel);
      Object.assign(updates, {
        [fields.status]: 'do_not_contact',
        [fields.basis]: CHANNEL_PERMISSION_BASIS.do_not_contact,
        [fields.sourceUrl]: current?.[fields.sourceUrl] || null,
        [fields.evidence]: current?.[fields.evidence] || 'Blocked from the prospect status',
        [fields.verifiedAt]: updates.updated_at,
        [fields.verifiedBy]: auth.user.id,
      });
    }
  }

  for (const channel of requestedChannelPermissions) {
    const prepared = channelPermissionUpdates(
      channel,
      body.channel_permissions[channel],
      auth,
      updates.updated_at,
    );
    if (prepared.error) return NextResponse.json({ error: prepared.error }, { status: 400 });
    Object.assign(updates, prepared.updates);
  }

  if (requestedChannelPermissions.length || updates.status === 'do_not_contact') {
    updates.contact_permission_status = summarizeChannelPermissions({ ...current, ...updates });
    if (updates.contact_permission_status === 'do_not_contact') updates.status = 'do_not_contact';
  }

  if ('email' in updates || 'phone' in updates || requestedChannelPermissions.length) {
    const scored = scoreProspect({ ...current, ...updates });
    updates.fit_score = scored.score;
    updates.fit_reasons = scored.reasons;
  }
  const { data, error } = await supabase
    .from('sales_prospects')
    .update(updates)
    .eq('id', body.id)
    .select(SELECT_FIELDS)
    .single();

  if (isProspectsTableMissing(error)) {
    return NextResponse.json({ error: 'Run prospector-migration.sql first.', setupRequired: true }, { status: 503 });
  }
  if (error) {
    console.error('[Prospects] Update failed:', error.message);
    return NextResponse.json({ error: 'Unable to update prospect' }, { status: 500 });
  }
  return NextResponse.json({ prospect: presentProspect(data) });
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Prospect ID is required' }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from('sales_prospects')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (isProspectsTableMissing(error)) {
    return NextResponse.json({ error: 'Run prospector-migration.sql first.', setupRequired: true }, { status: 503 });
  }
  if (error) {
    console.error('[Prospects] Delete failed:', error.message);
    return NextResponse.json({ error: 'Unable to delete prospect' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
