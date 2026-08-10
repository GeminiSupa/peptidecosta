import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  isProspectsTableMissing,
  normalizeProspectInput,
  normalizeOptionalUrl,
  normalizeProspectPeople,
  normalizeLinkedInProfileUrls,
  scoreProspect,
  PROSPECT_STATUSES,
  CONTACT_PERMISSION_STATUSES,
} from '@/lib/prospects.mjs';

export const dynamic = 'force-dynamic';

const SELECT_FIELDS = [
  'id', 'source_provider', 'source_external_id', 'organization_name', 'category',
  'website_url', 'phone', 'email', 'formatted_address', 'city', 'region', 'country',
  'latitude', 'longitude', 'google_maps_url', 'rating', 'user_rating_count',
  'business_status', 'status', 'fit_score', 'fit_reasons', 'contact_permission_status',
  'contact_source_url', 'enriched_at', 'people', 'linkedin_urls', 'owner_email', 'notes', 'last_contacted_at',
  'next_follow_up_at', 'created_at', 'updated_at',
].join(',');

const missingTableResponse = () => NextResponse.json({
  prospects: [],
  setupRequired: true,
  migration: 'prospector-migration.sql',
});

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('sales_prospects')
    .select(SELECT_FIELDS)
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (isProspectsTableMissing(error)) return missingTableResponse();
  if (error) {
    console.error('[Prospects] List failed:', error.message);
    return NextResponse.json({ error: 'Unable to load prospects' }, { status: 500 });
  }

  return NextResponse.json({ prospects: data || [], setupRequired: false });
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const input = normalizeProspectInput(await request.json());
  if (!input.organization_name) {
    return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return NextResponse.json({ error: 'Enter a valid work email' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const row = { ...input, updated_at: new Date().toISOString() };
  let existingId = null;
  if (row.source_external_id) {
    const { data: existing, error: lookupError } = await supabase
      .from('sales_prospects')
      .select('id')
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
  return NextResponse.json({ prospect: data }, { status: 201 });
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: 'Prospect ID is required' }, { status: 400 });

  const updates = {};
  if (PROSPECT_STATUSES.includes(body.status)) updates.status = body.status;
  if (CONTACT_PERMISSION_STATUSES.includes(body.contact_permission_status)) {
    updates.contact_permission_status = body.contact_permission_status;
    if (body.contact_permission_status === 'do_not_contact') updates.status = 'do_not_contact';
  }
  if ('owner_email' in body) updates.owner_email = String(body.owner_email || '').trim().toLowerCase() || null;
  if ('notes' in body) updates.notes = String(body.notes || '').trim().slice(0, 5000);
  if ('next_follow_up_at' in body) updates.next_follow_up_at = body.next_follow_up_at || null;
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
  updates.updated_at = new Date().toISOString();

  const supabase = getSupabaseAdmin();
  if ('email' in updates || 'phone' in updates) {
    const { data: current, error: currentError } = await supabase
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
  return NextResponse.json({ prospect: data });
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Prospect ID is required' }, { status: 400 });

  const { error } = await getSupabaseAdmin().from('sales_prospects').delete().eq('id', id);
  if (isProspectsTableMissing(error)) {
    return NextResponse.json({ error: 'Run prospector-migration.sql first.', setupRequired: true }, { status: 503 });
  }
  if (error) {
    console.error('[Prospects] Delete failed:', error.message);
    return NextResponse.json({ error: 'Unable to delete prospect' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
