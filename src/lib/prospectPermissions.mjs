export const PROSPECT_PERMISSION_CHANNELS = ['email', 'whatsapp'];
export const CHANNEL_PERMISSION_STATUSES = [
  'unknown',
  'business_contact',
  'consented',
  'do_not_contact',
];

export const CHANNEL_PERMISSION_BASIS = {
  business_contact: 'published_business_contact',
  consented: 'express_consent',
  do_not_contact: 'opt_out',
};

const clean = (value, limit = 1000) => String(value ?? '').trim().slice(0, limit);

export function normalizePermissionChannel(value) {
  const channel = clean(value, 20).toLowerCase();
  return PROSPECT_PERMISSION_CHANNELS.includes(channel) ? channel : null;
}

export function channelPermissionFields(channel) {
  const normalized = normalizePermissionChannel(channel);
  if (!normalized) return null;
  return {
    status: `${normalized}_permission_status`,
    basis: `${normalized}_permission_basis`,
    sourceUrl: `${normalized}_permission_source_url`,
    evidence: `${normalized}_permission_evidence`,
    verifiedAt: `${normalized}_permission_verified_at`,
    verifiedBy: `${normalized}_permission_verified_by`,
  };
}

export function channelPermissionFor(prospect = {}, channel) {
  const fields = channelPermissionFields(channel);
  if (!fields) return null;
  const status = CHANNEL_PERMISSION_STATUSES.includes(prospect[fields.status])
    ? prospect[fields.status]
    : 'unknown';
  return {
    channel: normalizePermissionChannel(channel),
    status,
    basis: clean(prospect[fields.basis], 80) || null,
    sourceUrl: clean(prospect[fields.sourceUrl], 1000) || null,
    evidence: clean(prospect[fields.evidence], 1000) || null,
    verifiedAt: prospect[fields.verifiedAt] || null,
    verifiedBy: prospect[fields.verifiedBy] || null,
  };
}

export function summarizeChannelPermissions(prospect = {}) {
  const statuses = PROSPECT_PERMISSION_CHANNELS.map(
    (channel) => channelPermissionFor(prospect, channel)?.status || 'unknown',
  );
  if (statuses.every((status) => status === 'do_not_contact')) return 'do_not_contact';
  if (statuses.includes('consented')) return 'consented';
  if (statuses.includes('business_contact')) return 'business_contact';
  return 'unknown';
}

export function permissionStatusTone(status) {
  if (status === 'do_not_contact') return 'danger';
  if (status === 'business_contact' || status === 'consented') return 'ready';
  return 'warning';
}

export function permissionBasisLabel(basis) {
  if (basis === 'published_business_contact') return 'Published business contact';
  if (basis === 'express_consent') return 'Express consent';
  if (basis === 'opt_out') return 'Opt-out';
  return clean(basis, 80).replaceAll('_', ' ') || 'Not recorded';
}
