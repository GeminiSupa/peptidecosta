import { randomUUID } from 'crypto';
import { buildBookingUrl, generateBookingToken } from '@/lib/prospectOutreach.mjs';

export const PROSPECT_OUTREACH_FIELDS = [
  'id', 'organization_name', 'category', 'website_url', 'phone', 'email',
  'city', 'region', 'country', 'status', 'contact_permission_status',
  'email_permission_status', 'email_permission_basis', 'email_permission_source_url',
  'email_permission_evidence', 'email_permission_verified_at', 'email_permission_verified_by',
  'whatsapp_permission_status', 'whatsapp_permission_basis', 'whatsapp_permission_source_url',
  'whatsapp_permission_evidence', 'whatsapp_permission_verified_at', 'whatsapp_permission_verified_by',
  'people', 'whatsapp_numbers', 'notes', 'booking_token', 'meeting_booked_at',
].join(',');

export function getCalBookingBaseUrl() {
  return String(process.env.CAL_BOOKING_URL || '').trim();
}

/**
 * Gives the prospect a booking token the first time one is needed.
 *
 * Minted lazily rather than at discovery so the millions of rows a wide search
 * can create do not each carry a token that is never used, and so an existing
 * pipeline picks tokens up without a backfill.
 */
export async function ensureBookingToken(supabase, prospect) {
  if (prospect.booking_token) return prospect.booking_token;

  const token = generateBookingToken(randomUUID);
  const { error } = await supabase
    .from('sales_prospects')
    .update({ booking_token: token, updated_at: new Date().toISOString() })
    .eq('id', prospect.id);

  if (error) throw error;
  return token;
}

export async function resolveBookingUrl(supabase, prospect) {
  const base = getCalBookingBaseUrl();
  if (!base) return null;
  const token = await ensureBookingToken(supabase, prospect);
  return buildBookingUrl(base, token);
}
